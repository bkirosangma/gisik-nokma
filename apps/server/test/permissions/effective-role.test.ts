import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@gisik-nokma/domain';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import {
  hasProjectAdminRights,
  resolveEffectiveRole,
} from '../../src/permissions/effective-role.js';
import { membershipsProjection } from '../../src/projections/proj-memberships.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { resetTestSequences, testEnvelope } from '../helpers/envelope.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_memberships');
  // Safe here: nothing in this file writes the ledger, so restarting the
  // workspace-stream counter cannot collide with UNIQUE (workspace_id,
  // workspace_seq).
  resetTestSequences();
});

const WORKSPACE = newUlid();
const OTHER_WORKSPACE = newUlid();
const ADMIN = newUlid();
const PROJECT = newUlid();
const OTHER_PROJECT = newUlid();

/**
 * Rows are seeded by applying real events through the projection, never by
 * INSERTing the table by hand. A hand-written row can express a state the
 * ledger cannot produce — a project-scope row with role 'guest', say — and a
 * test built on one proves something about a table rather than about the
 * product.
 */
async function apply(event: LedgerEvent): Promise<void> {
  const client = await db.pool.connect();
  try {
    await membershipsProjection.apply(event, client);
  } finally {
    client.release();
  }
}

async function grant(
  userId: string,
  role: 'owner' | 'admin' | 'member' | 'guest',
  workspaceId = WORKSPACE,
): Promise<void> {
  await apply(
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role },
      actorId: ADMIN,
    }),
  );
}

async function revoke(userId: string, workspaceId = WORKSPACE): Promise<void> {
  await apply(
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.revoked',
      payload: { userId },
      actorId: ADMIN,
    }),
  );
}

async function addToProject(
  userId: string,
  projectId: string,
  projectAdmin: boolean,
  workspaceId = WORKSPACE,
): Promise<void> {
  await apply(
    testEnvelope({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId, projectAdmin },
      actorId: ADMIN,
    }),
  );
}

describe('resolveEffectiveRole', () => {
  it('a non-member resolves to null with no projects', async () => {
    const eff = await resolveEffectiveRole(db.pool, newUlid(), WORKSPACE);
    expect(eff.workspaceRole).toBeNull();
    expect(eff.projects.size).toBe(0);
  });

  it('a workspace role and the projects the user is on resolve together', async () => {
    const user = newUlid();
    await grant(user, 'member');
    await addToProject(user, PROJECT, true);
    await addToProject(user, OTHER_PROJECT, false);

    const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    expect(eff.workspaceRole).toBe('member');
    expect(eff.projects.get(PROJECT)).toEqual({ projectAdmin: true });
    expect(eff.projects.get(OTHER_PROJECT)).toEqual({ projectAdmin: false });
    expect(eff.projects.size).toBe(2);
  });

  it('a guest is a guest of the workspace and, without a roster row, of no project', async () => {
    const user = newUlid();
    await grant(user, 'guest');

    const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    // A guest reaches work through visibility.set's explicit lists (spec §6),
    // not through a project association.
    expect(eff.workspaceRole).toBe('guest');
    expect(eff.projects.size).toBe(0);
  });

  it('the newest grant wins: a role change resolves to the later role', async () => {
    const user = newUlid();
    await grant(user, 'member');
    await grant(user, 'admin');
    expect((await resolveEffectiveRole(db.pool, user, WORKSPACE)).workspaceRole).toBe('admin');

    await grant(user, 'guest');
    expect((await resolveEffectiveRole(db.pool, user, WORKSPACE)).workspaceRole).toBe('guest');
  });

  /**
   * The guarantee the projection deliberately does NOT enforce at the table.
   *
   * membership.revoked deletes the workspace row alone, because the roster rows
   * belong to the project entity's stream and a cross-entity delete would make
   * proj_memberships depend on arrival interleaving (see proj-memberships.ts,
   * and the rebuild-vs-live test in test/proj-memberships.test.ts). So a roster
   * row for a revoked user genuinely survives — this is what stops it meaning
   * anything.
   *
   * Delete the `workspaceRole === null` early return in effective-role.ts and
   * this goes red in three places at once, which is the point: a person put out
   * of a workspace would otherwise still resolve a project association, and
   * with projectAdmin true, management rights over it.
   */
  it('a revoked member resolves to nothing, though the roster row survives in the table', async () => {
    const user = newUlid();
    await grant(user, 'member');
    await addToProject(user, PROJECT, true);
    await revoke(user);

    // The row really is still there — otherwise this test would be asserting
    // the guard while the deletion did the work, and would pass with the guard
    // removed.
    const surviving = await db.pool.query(
      `SELECT scope_kind, project_id, project_admin FROM proj_memberships
       WHERE workspace_id = $1 AND user_id = $2`,
      [WORKSPACE, user],
    );
    expect(surviving.rows).toEqual([
      { scope_kind: 'project', project_id: PROJECT, project_admin: true },
    ]);

    const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    expect(eff.workspaceRole).toBeNull();
    expect(eff.projects.size).toBe(0);
    expect(hasProjectAdminRights(eff, PROJECT)).toBe(false);
  });

  it('a re-grant after a revocation restores the role', async () => {
    const user = newUlid();
    await grant(user, 'member');
    await revoke(user);
    await grant(user, 'member');

    expect((await resolveEffectiveRole(db.pool, user, WORKSPACE)).workspaceRole).toBe('member');
  });

  it('resolves within one workspace: a role held elsewhere does not carry over', async () => {
    const user = newUlid();
    await grant(user, 'owner', OTHER_WORKSPACE);
    await addToProject(user, PROJECT, true, OTHER_WORKSPACE);

    const here = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    expect(here.workspaceRole).toBeNull();
    expect(here.projects.size).toBe(0);

    const there = await resolveEffectiveRole(db.pool, user, OTHER_WORKSPACE);
    expect(there.workspaceRole).toBe('owner');
    expect(there.projects.get(PROJECT)).toEqual({ projectAdmin: true });
  });
});

describe('hasProjectAdminRights', () => {
  it('workspace owners and admins hold management rights on every project, including ones they are not on', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const user = newUlid();
      await grant(user, role);
      const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
      expect(hasProjectAdminRights(eff, newUlid())).toBe(true);
    }
  });

  it('a project admin holds rights on that project only', async () => {
    const user = newUlid();
    await grant(user, 'member');
    await addToProject(user, PROJECT, true);

    const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    expect(hasProjectAdminRights(eff, PROJECT)).toBe(true);
    expect(hasProjectAdminRights(eff, OTHER_PROJECT)).toBe(false);
  });

  it('a plain project member holds no management rights', async () => {
    const user = newUlid();
    await grant(user, 'member');
    await addToProject(user, PROJECT, false);

    const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    expect(hasProjectAdminRights(eff, PROJECT)).toBe(false);
  });

  it('a guest holds no management rights, even on a project they are on', async () => {
    const user = newUlid();
    await grant(user, 'guest');
    await addToProject(user, PROJECT, false);

    const eff = await resolveEffectiveRole(db.pool, user, WORKSPACE);
    expect(eff.workspaceRole).toBe('guest');
    expect(hasProjectAdminRights(eff, PROJECT)).toBe(false);
  });
});
