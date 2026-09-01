import { describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
// AS-BUILT (Plan 4 Task 5, landed 2026-08-31): `checkRolePermission(env, ctx)` keeps its
// arity, its purity and its return type, but `PermissionContext` gained a THIRD, REQUIRED
// member — `workspaceExists: boolean`. The `roleCtx` helper below builds
// `{ sessionUserId, eff }` and would NOT compile without it; `workspaceExists: false` is
// added below. The value is irrelevant here (it only changes the answer for
// `workspace.created`), but it is required rather than optional on purpose: `false` is the
// permissive value, and an optional field would let a forgetful call site re-open the
// founding-bypass escalation while typechecking green. See Plan 4 Task 5's correction block.
import { checkRolePermission } from '../../src/permissions/check-permission.js';

function settingsEnvelope(actorId: string): EventEnvelope {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.settings_set',
    version: 1,
    payload: { staleDays: 3 },
    actorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 2,
  };
}

/**
 * Hand-built `EffectiveRole`, cast the same way `check-role-permission.test.ts`
 * does (Plan 4 Task 8 branded the type, ruling P22, case 6.64): a hand-builder
 * must assert at a greppable site rather than satisfy the shape structurally.
 */
function roleCtx(workspaceRole: EffectiveRole['workspaceRole']): { sessionUserId: string; eff: EffectiveRole; workspaceExists: boolean } {
  const eff = { workspaceRole, projects: new Map() } as unknown as EffectiveRole;
  return { sessionUserId: 'usr_actor', eff, workspaceExists: false };
}

describe('workspace.settings_set permission', () => {
  it('allows owners and admins', () => {
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('owner'))).toBeNull();
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('admin'))).toBeNull();
  });

  it('PLANTED DEFECT: a member claiming the staleness threshold is refused with the rule and reason named', () => {
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('member'))).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can change workspace settings.',
    });
  });

  it('refuses guests and non-members identically', () => {
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('guest'))).toMatchObject({
      refused: true,
      rule: 'permission.role',
    });
    expect(checkRolePermission(settingsEnvelope('usr_actor'), roleCtx(null))).toMatchObject({
      refused: true,
      rule: 'permission.role',
    });
  });
});
