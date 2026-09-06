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
import { checkRolePermission, NOT_A_MEMBER_REASON } from '../../src/permissions/check-permission.js';

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

/**
 * 7.58 — cited on the block: the row states both halves and each has its own test below — `checkRolePermission` on `workspace.settings_set` admits workspace `owner` and `admin` (null), and refuses `member` and `guest` under `permission.role` by EXACT equality on rule and reason.
 */
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

  // Both are refused and both carry `permission.role`, but they are NOT the same
  // refusal, and the title says so because the assertions check it. A guest holds a
  // role, so it falls through to the settings case and is told which knob it may not
  // turn; a NON-member is stopped earlier by the `role === null` branch and is told
  // only that it is not a member — naming the setting would disclose it to somebody
  // holding nothing here. Asserted by EXACT EQUALITY rather than `toMatchObject`, so a
  // reason that drifted into agreement would redden: `toMatchObject` on
  // `{refused, rule}` alone passes whatever the reason says, which is what let the
  // earlier title claim 'identically' for two answers that differ.
  it('refuses guests and non-members — both under permission.role, and NOT with the same reason', () => {
    const guest = checkRolePermission(settingsEnvelope('usr_actor'), roleCtx('guest'));
    const stranger = checkRolePermission(settingsEnvelope('usr_actor'), roleCtx(null));

    // Narrows for the comparisons below, and is itself the first claim: `null` is how
    // this function ADMITS, so a null here would be a permission hole reading as a pass.
    if (guest === null || stranger === null) {
      throw new Error('guest and non-member must both be REFUSED; null is an admission');
    }

    expect(guest).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can change workspace settings.',
    });
    expect(stranger).toEqual({
      refused: true,
      rule: 'permission.role',
      reason: NOT_A_MEMBER_REASON,
    });

    // The point of the case, restated as the comparison. REDUNDANT on purpose and
    // labelled as such: the two exact equalities above already pin both reasons, so
    // nothing can redden these three lines while those two hold. They document what
    // the case is about; they are not a second guard, and calling them one would be
    // the same overclaim the old title made.
    expect(guest.rule).toBe(stranger.rule);
    expect(guest.reason).not.toBe(stranger.reason);
    // ...and the stranger's reason does not name the setting, which is the disclosure
    // this branch ordering exists to prevent.
    expect(stranger.reason).not.toContain('settings');
  });
});
