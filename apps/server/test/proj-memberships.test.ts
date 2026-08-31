import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@gisik-nokma/domain';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { membershipsProjection } from '../src/projections/proj-memberships.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { testEnvelope } from './helpers/envelope.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_memberships');
});

/**
 * The sequence counters in helpers/envelope.ts are NOT reset between tests in
 * this file. One test below seeds the real ledger, whose
 * UNIQUE (workspace_id, workspace_seq) would be violated by a second test
 * reusing a workspace stream position — so the counter stays monotonic for the
 * whole file and no assertion here depends on an absolute value.
 */

/**
 * Real ULIDs, not `usr_1`. events/membership.ts types every user id as
 * `ulidString` and says so: the plan text's `usr_1` fixtures describe events the
 * door refuses, and this projection parses its payloads with the door's own
 * schemas, so a fixture built the plan's way would throw here rather than
 * quietly store nonsense.
 */
const WORKSPACE = newUlid();
const ADMIN = newUlid();
const USER = newUlid();
const OTHER_USER = newUlid();
const PROJECT = newUlid();
const OTHER_PROJECT = newUlid();

function grant(userId: string, role: 'owner' | 'admin' | 'member' | 'guest'): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'membership', id: membershipId(WORKSPACE, userId) },
    type: 'membership.granted',
    payload: { userId, role },
    actorId: ADMIN,
  });
}

function revoke(userId: string): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'membership', id: membershipId(WORKSPACE, userId) },
    type: 'membership.revoked',
    payload: { userId },
    actorId: ADMIN,
  });
}

function addToProject(userId: string, projectId: string, projectAdmin: boolean): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId, projectAdmin },
    actorId: ADMIN,
  });
}

function removeFromProject(userId: string, projectId: string): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_removed',
    payload: { userId },
    actorId: ADMIN,
  });
}

async function applyLive(events: readonly LedgerEvent[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await membershipsProjection.apply(event, client);
    }
  } finally {
    client.release();
  }
}

type Row = {
  user_id: string;
  scope_kind: string;
  project_id: string;
  role: string;
  project_admin: boolean;
};

async function rows(): Promise<Row[]> {
  const result = await db.pool.query<Row>(
    `SELECT user_id, scope_kind, project_id, role, project_admin
     FROM proj_memberships
     ORDER BY user_id, scope_kind, project_id`,
  );
  return result.rows;
}

describe('membershipsProjection.apply', () => {
  it('materializes a workspace grant, recording who granted it, when, and at which stream position', async () => {
    const event = grant(USER, 'member');
    await applyLive([event]);

    const result = await db.pool.query(
      `SELECT workspace_id, user_id, scope_kind, project_id, role, project_admin,
              granted_by, granted_at, workspace_seq
       FROM proj_memberships`,
    );
    expect(result.rows).toEqual([
      {
        workspace_id: WORKSPACE,
        user_id: USER,
        scope_kind: 'workspace',
        project_id: '',
        role: 'member',
        project_admin: false,
        granted_by: ADMIN,
        // The instant, not its rendering — the column stores the moment and the
        // session is Asia/Kolkata, so an assertion on a formatted string would
        // be about the reader's clock rather than about what was stored.
        granted_at: new Date(event.serverTime),
        // The WORKSPACE stream cursor, not the per-entity seq. The fixture
        // gives the two different values on purpose (helpers/envelope.ts), so
        // storing the wrong one fails here instead of passing by coincidence.
        workspace_seq: event.workspaceSeq,
      },
    ]);
    expect(event.workspaceSeq).not.toBe(event.seq);
  });

  it('a re-grant updates the role in place — one row per membership identity, carrying the later event', async () => {
    const first = grant(USER, 'member');
    const second = grant(USER, 'admin');
    await applyLive([first, second]);

    const result = await db.pool.query(
      'SELECT role, granted_at, workspace_seq FROM proj_memberships',
    );
    expect(result.rows).toEqual([
      { role: 'admin', granted_at: new Date(second.serverTime), workspace_seq: second.workspaceSeq },
    ]);
  });

  it('a revocation removes the workspace row, so the role stops being conferred', async () => {
    await applyLive([grant(USER, 'admin'), revoke(USER)]);
    expect(await rows()).toEqual([]);
  });

  it('a revocation touches only the revoked user', async () => {
    await applyLive([grant(USER, 'member'), grant(OTHER_USER, 'member'), revoke(USER)]);
    expect(await rows()).toEqual([
      { user_id: OTHER_USER, scope_kind: 'workspace', project_id: '', role: 'member', project_admin: false },
    ]);
  });

  it('project roster events add and remove project-scope rows, carrying the project-admin flag', async () => {
    await applyLive([addToProject(USER, PROJECT, true)]);
    expect(await rows()).toEqual([
      { user_id: USER, scope_kind: 'project', project_id: PROJECT, role: 'member', project_admin: true },
    ]);

    await applyLive([removeFromProject(USER, PROJECT)]);
    expect(await rows()).toEqual([]);
  });

  it('project removal takes the one project row and leaves the workspace row and other projects standing', async () => {
    await applyLive([
      grant(USER, 'member'),
      addToProject(USER, PROJECT, false),
      addToProject(USER, OTHER_PROJECT, true),
      removeFromProject(USER, PROJECT),
    ]);
    // rows() orders by (user_id, scope_kind, project_id), and 'project' sorts
    // before 'workspace'.
    expect(await rows()).toEqual([
      { user_id: USER, scope_kind: 'project', project_id: OTHER_PROJECT, role: 'member', project_admin: true },
      { user_id: USER, scope_kind: 'workspace', project_id: '', role: 'member', project_admin: false },
    ]);
  });

  it('ignores an event type it does not read', async () => {
    await applyLive([
      testEnvelope({
        workspaceId: WORKSPACE,
        entity: { kind: 'workspace', id: WORKSPACE },
        type: 'workspace.created',
        payload: { name: 'Convenience Corner' },
        actorId: ADMIN,
      }),
    ]);
    expect(await rows()).toEqual([]);
  });

  it('refuses a payload it cannot honestly store rather than writing undefined', async () => {
    // project.member_added's projectAdmin is required with no default
    // (events/membership.ts: "a project-admin flag is a claim, not a default").
    // Casting the payload instead of parsing it would store NULL here and fail
    // the NOT NULL constraint with a message about the database, not the claim.
    const client = await db.pool.connect();
    try {
      await expect(
        membershipsProjection.apply(
          testEnvelope({
            workspaceId: WORKSPACE,
            entity: { kind: 'project', id: PROJECT },
            type: 'project.member_added',
            payload: { userId: USER },
            actorId: ADMIN,
          }),
          client,
        ),
      ).rejects.toThrowError(/project-admin flag is a claim/);
    } finally {
      client.release();
    }
    expect(await rows()).toEqual([]);
  });

  /**
   * The one place this file writes the table by hand, deliberately: the row
   * being asserted about is one the projection CANNOT produce, so there is no
   * event that would reach the constraint. Without this the CHECK would be
   * decorative — introduced by the migration, never exercised, and first heard
   * from in production as a constraint-violation message that explains nothing
   * about the claim that caused it.
   */
  it('the schema refuses a scope that disagrees with its project id', async () => {
    const base = [WORKSPACE, USER, 'member', ADMIN, new Date().toISOString(), 1];
    const insert = `INSERT INTO proj_memberships
        (workspace_id, user_id, scope_kind, project_id, role, project_admin, granted_by, granted_at, workspace_seq)
      VALUES ($1, $2, $7, $8, $3, false, $4, $5, $6)`;

    // A workspace-scope row is the whole workspace, so it names no project.
    await expect(
      db.pool.query(insert, [...base, 'workspace', PROJECT]),
    ).rejects.toThrowError(/proj_memberships_workspace_scope_has_no_project/);

    // A project-scope row that names no project is not about anything.
    await expect(
      db.pool.query(insert, [...base, 'project', '']),
    ).rejects.toThrowError(/proj_memberships_workspace_scope_has_no_project/);

    // The positive control: the same statement with the two agreeing is accepted,
    // so the rejections above are the constraint and not a broken INSERT.
    await db.pool.query(insert, [...base, 'project', PROJECT]);
    expect(await rows()).toEqual([
      { user_id: USER, scope_kind: 'project', project_id: PROJECT, role: 'member', project_admin: false },
    ]);
  });

  it('reset empties the table it declares', async () => {
    await applyLive([grant(USER, 'member'), addToProject(USER, PROJECT, true)]);
    expect(await rows()).toHaveLength(2);

    const client = await db.pool.connect();
    try {
      await membershipsProjection.reset(client);
    } finally {
      client.release();
    }
    expect(await rows()).toEqual([]);
  });
});

/**
 * The registry contract's second clause, applied to the one projection in the
 * codebase that TWO entity streams write:
 *
 *   "Table contents must be a pure function of the ledger's rows — never of
 *    cross-entity arrival interleaving. Replay delivers canonical order
 *    (entity_kind, entity_id, seq): per-entity causality only."
 *
 * membership.granted/revoked are filed against the MEMBERSHIP entity;
 * project.member_added/removed against the PROJECT entity. readLedger orders by
 * (entity_kind, entity_id, seq) and 'membership' < 'project', so on a rebuild
 * every membership event is applied before every roster event — whatever order
 * they arrived in.
 *
 * This test is what stops the plan text's `membership.revoked` handler ("delete
 * every row for that user, project rows included") from landing: under it, the
 * arrival order below leaves {} live and { project row } on rebuild, and
 * verify-projections' EXCEPT diff reports drift on a table nobody corrupted.
 * Re-add `AND scope_kind = 'workspace'`'s removal to the DELETE and this goes
 * red.
 */
describe('proj_memberships is a pure function of the ledger, not of arrival order', () => {
  it('live application and a rebuild from the ledger agree, though the two orders differ', async () => {
    const workspace = newUlid();
    const user = newUlid();
    const project = newUlid();

    const granted = testEnvelope({
      workspaceId: workspace,
      entity: { kind: 'membership', id: membershipId(workspace, user) },
      type: 'membership.granted',
      payload: { userId: user, role: 'member' },
      actorId: ADMIN,
    });
    const added = testEnvelope({
      workspaceId: workspace,
      entity: { kind: 'project', id: project },
      type: 'project.member_added',
      payload: { userId: user, projectAdmin: true },
      actorId: ADMIN,
    });
    const revoked = testEnvelope({
      workspaceId: workspace,
      entity: { kind: 'membership', id: membershipId(workspace, user) },
      type: 'membership.revoked',
      payload: { userId: user },
      actorId: ADMIN,
    });
    const arrival = [granted, added, revoked];

    // The premise, asserted rather than assumed: canonical replay order really
    // is different from arrival order here. Without this the whole comparison
    // below could pass vacuously if the two ever coincided.
    const canonical = [...arrival].sort(
      (a, b) =>
        a.entity.kind.localeCompare(b.entity.kind) ||
        a.entity.id.localeCompare(b.entity.id) ||
        a.seq - b.seq,
    );
    expect(arrival.indexOf(revoked)).toBeGreaterThan(arrival.indexOf(added));
    expect(canonical.indexOf(revoked)).toBeLessThan(canonical.indexOf(added));

    const client = await db.pool.connect();
    try {
      for (const event of arrival) {
        await insertEvent(client, event);
      }
    } finally {
      client.release();
    }

    await applyLive(arrival);
    const live = await rows();

    await rebuildProjection('proj_memberships', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    const rebuilt = await rows();

    expect(rebuilt).toEqual(live);
    // Named, so the agreement above cannot be an agreement on emptiness: the
    // roster row survives the revocation in BOTH passes, and
    // resolveEffectiveRole is what stops it conferring anything.
    expect(live).toEqual([
      { user_id: user, scope_kind: 'project', project_id: project, role: 'member', project_admin: true },
    ]);
  });
});

/**
 * The projection contract's shadow-schema fence, exercised on this table.
 *
 * tools/verify-projections.ts creates one shadow copy per name in a
 * projection's `tables`, then re-derives with `search_path = verify_shadow,
 * public` so unqualified names resolve to the shadow copies. Two ways to fall
 * off that fence, both of which write LIVE during a read-only verify: leave
 * `tables` empty (no shadow copy is made, so every unqualified name resolves to
 * public) or schema-qualify a name in the SQL (it escapes search_path outright).
 *
 * Asserting "verify is clean" would catch neither — with no shadow table the
 * verifier also skips the diff, and a rebuild into live still agrees with
 * itself. So the assertion is that a PLANTED defect in the live table is
 * REPORTED, which only happens if a shadow copy exists to disagree with it.
 */
describe('proj_memberships under verify-projections', () => {
  it('a corrupted live row is reported against the ledger rebuild, and live is left alone', async () => {
    const workspace = newUlid();
    const user = newUlid();
    const project = newUlid();
    const client = await db.pool.connect();
    try {
      await insertEvent(
        client,
        testEnvelope({
          workspaceId: workspace,
          entity: { kind: 'membership', id: membershipId(workspace, user) },
          type: 'membership.granted',
          payload: { userId: user, role: 'admin' },
          actorId: ADMIN,
        }),
      );
      await insertEvent(
        client,
        testEnvelope({
          workspaceId: workspace,
          entity: { kind: 'project', id: project },
          type: 'project.member_added',
          payload: { userId: user, projectAdmin: true },
          actorId: ADMIN,
        }),
      );
    } finally {
      client.release();
    }

    // Bring every live projection into agreement with the whole ledger first,
    // so the only drift the verifier can find is the one planted below.
    const projections = buildProjectionRegistry();
    for (const projection of projections.all()) {
      await rebuildProjection(projection.name, { pool: db.pool, projections });
    }
    const baseline = await verifyProjections({ pool: db.pool, projections });
    expect(baseline).toEqual({ clean: true, diffs: [] });

    await db.pool.query(
      `UPDATE proj_memberships SET role = 'guest'
       WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
      [workspace, user],
    );

    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_memberships']);
    expect(report.diffs[0]).toMatchObject({ missingFromLive: 1, extraInLive: 1 });

    // The verify wrote nothing live: the planted corruption is still there,
    // which it would not be if the rebuild had escaped into the public schema.
    const after = await db.pool.query<{ role: string }>(
      `SELECT role FROM proj_memberships
       WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
      [workspace, user],
    );
    expect(after.rows).toEqual([{ role: 'guest' }]);
  });
});
