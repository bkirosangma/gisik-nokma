import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { WorkspaceRole } from '../../src/entity-state.js';
import {
  WORKSPACE_ROLES,
  membershipGrantedPayload,
  membershipRevokedPayload,
  projectCreatedPayload,
  projectMemberAddedPayload,
  projectMemberRemovedPayload,
  workspaceCreatedPayload,
  workspaceRenamedPayload,
  workspaceRoleSchema,
} from '../../src/events/membership.js';
import { newUlid } from '../../src/ids.js';
import { domainRegistry } from '../../src/vocabulary.js';

/**
 * Same helper as envelope.test.ts, for the same reason: a bare `.success ===
 * false` stays green when the check underneath it is deleted, so every refusal
 * below asserts the path AND the exact message.
 */
function rejectionIssues<Input, Output>(
  result: z.SafeParseReturnType<Input, Output>,
): Array<{ path: (string | number)[]; message: string }> {
  if (result.success) {
    throw new Error('expected safeParse to fail, but it succeeded');
  }
  return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

describe('workspaceCreatedPayload', () => {
  it('accepts a non-empty name', () => {
    expect(workspaceCreatedPayload.parse({ name: 'Convenience Corner' })).toEqual({ name: 'Convenience Corner' });
  });

  it('planted defect: refuses a missing or empty name', () => {
    expect(rejectionIssues(workspaceCreatedPayload.safeParse({}))).toContainEqual({
      path: ['name'],
      message: 'Required',
    });
    expect(rejectionIssues(workspaceCreatedPayload.safeParse({ name: '' }))).toContainEqual({
      path: ['name'],
      message: 'String must contain at least 1 character(s)',
    });
  });

  it('planted defect: refuses a name of only spaces, and does not silently trim one that has content', () => {
    // `.min(1)` alone lets `'   '` through; the plan pinned the trim check, so
    // this is what taking Plan 1's provisional shape over actually changes.
    expect(rejectionIssues(workspaceCreatedPayload.safeParse({ name: '  ' }))).toContainEqual({
      path: ['name'],
      message: 'must not be blank — a name of only spaces names nothing',
    });
    // And the claim survives verbatim: refusing blanks must not become trimming.
    expect(workspaceCreatedPayload.parse({ name: '  Corner  ' })).toEqual({ name: '  Corner  ' });
  });
});

describe('workspaceRenamedPayload', () => {
  // Plan 1 seeded this type PROVISIONALLY; Plan 4 takes it over rather than
  // re-registering it, so its shape is pinned here for the first time.
  it('accepts a non-empty name and refuses a blank one', () => {
    expect(workspaceRenamedPayload.parse({ name: 'Corner Shop' })).toEqual({ name: 'Corner Shop' });
    expect(rejectionIssues(workspaceRenamedPayload.safeParse({ name: '  ' }))).toContainEqual({
      path: ['name'],
      message: 'must not be blank — a name of only spaces names nothing',
    });
  });
});

describe('projectCreatedPayload', () => {
  it('accepts a non-empty name', () => {
    expect(projectCreatedPayload.parse({ name: 'Registrations' })).toEqual({ name: 'Registrations' });
  });

  it('planted defect: refuses junk', () => {
    expect(rejectionIssues(projectCreatedPayload.safeParse(null))).toContainEqual({
      path: [],
      message: 'Expected object, received null',
    });
  });
});

describe('membershipGrantedPayload', () => {
  it('accepts a workspace grant', () => {
    const userId = newUlid();
    expect(membershipGrantedPayload.parse({ userId, role: 'admin' })).toEqual({ userId, role: 'admin' });
  });

  it('planted defect: refuses an unknown role', () => {
    const result = membershipGrantedPayload.safeParse({ userId: newUlid(), role: 'superuser' });
    expect(rejectionIssues(result)).toContainEqual({
      path: ['role'],
      message: "Invalid enum value. Expected 'owner' | 'admin' | 'member' | 'guest', received 'superuser'",
    });
  });

  it('planted defect: refuses a scope, rather than ignoring one', () => {
    // Both shapes the removed `MembershipScope` could take. Accepting either and
    // dropping it would take in a claim meaning "put them on project P" and do
    // something else — the quiet acceptance the honesty contract forbids.
    const withObject = membershipGrantedPayload.safeParse({
      userId: newUlid(),
      role: 'guest',
      scope: { projectId: newUlid() },
    });
    expect(rejectionIssues(withObject)).toContainEqual({
      path: ['scope'],
      message: 'membership.granted no longer takes a scope; use project.member_added to put someone on a project',
    });
    const withString = membershipGrantedPayload.safeParse({
      userId: newUlid(),
      role: 'member',
      scope: 'workspace',
    });
    expect(rejectionIssues(withString)).toContainEqual({
      path: ['scope'],
      message: 'membership.granted no longer takes a scope; use project.member_added to put someone on a project',
    });
  });

  it('planted defect: the scope sentence is specific to scope, not a blanket message for every stray key', () => {
    // `.strict()` alone would answer "Unrecognized key(s)" for `scope` too —
    // true and useless. Declaring `scope` is what keeps the sentence that says
    // where to go instead; this asserts the declaration did not turn into a
    // blanket message that lies about unrelated keys.
    const result = membershipGrantedPayload.safeParse({ userId: newUlid(), role: 'member', colour: 'red' });
    expect(rejectionIssues(result)).toEqual([{ path: [], message: "Unrecognized key(s) in object: 'colour'" }]);
  });

  it('planted defect: refuses a userId that is not a ULID — the composite entity id could not otherwise be addressed', () => {
    // Not a style choice. A membership is addressed as `${workspaceId}:${userId}`
    // and the door admits only `^<ULID>:<ULID>$`, so a grant naming `usr_1`
    // could never be filed at an id the door would accept.
    const result = membershipGrantedPayload.safeParse({ userId: 'usr_1', role: 'member' });
    expect(rejectionIssues(result)).toContainEqual({ path: ['userId'], message: 'must be a ULID' });
  });
});

describe('workspaceRoleSchema', () => {
  it('accepts exactly the four workspace roles and refuses a fifth', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(workspaceRoleSchema.parse(role)).toBe(role);
    }
    expect(workspaceRoleSchema.safeParse('wizard').success).toBe(false);
  });

  it('is the same four as WorkspaceRole, checked in the direction `satisfies` cannot check', () => {
    // `WORKSPACE_ROLES ... satisfies readonly WorkspaceRole[]` in the source
    // catches a role this list has and the type does not. This switch catches
    // the reverse: add a member to `WorkspaceRole` and it stops compiling,
    // because a non-exhaustive switch cannot satisfy the declared return type.
    function narrow(role: WorkspaceRole): (typeof WORKSPACE_ROLES)[number] {
      switch (role) {
        case 'owner':
        case 'admin':
        case 'member':
        case 'guest':
          return role;
      }
    }
    expect(WORKSPACE_ROLES.map(narrow)).toEqual(['owner', 'admin', 'member', 'guest']);
  });
});

describe('membershipRevokedPayload', () => {
  it('accepts a userId', () => {
    const userId = newUlid();
    expect(membershipRevokedPayload.parse({ userId })).toEqual({ userId });
  });

  it('planted defect: refuses a missing userId', () => {
    expect(rejectionIssues(membershipRevokedPayload.safeParse({}))).toContainEqual({
      path: ['userId'],
      message: 'Required',
    });
  });

  it('planted defect: refuses a scope, rather than ignoring one', () => {
    const result = membershipRevokedPayload.safeParse({ userId: newUlid(), scope: { projectId: newUlid() } });
    expect(rejectionIssues(result)).toContainEqual({
      path: ['scope'],
      message: 'membership.revoked no longer takes a scope; use project.member_removed to take someone off a project',
    });
  });
});

describe('projectMemberAddedPayload', () => {
  it('accepts userId and an explicit projectAdmin flag', () => {
    const userId = newUlid();
    expect(projectMemberAddedPayload.parse({ userId, projectAdmin: true })).toEqual({ userId, projectAdmin: true });
  });

  it('planted defect: refuses a missing projectAdmin flag — the flag is a claim, not a default', () => {
    const result = projectMemberAddedPayload.safeParse({ userId: newUlid() });
    expect(rejectionIssues(result)).toContainEqual({
      path: ['projectAdmin'],
      message: 'is required — a project-admin flag is a claim, not a default',
    });
  });

  it('planted defect: refuses a non-boolean projectAdmin — "true" the string is not the claim', () => {
    const result = projectMemberAddedPayload.safeParse({ userId: newUlid(), projectAdmin: 'true' });
    expect(rejectionIssues(result)).toContainEqual({
      path: ['projectAdmin'],
      message: 'is required — a project-admin flag is a claim, not a default',
    });
  });
});

describe('projectMemberRemovedPayload', () => {
  it('accepts a userId', () => {
    const userId = newUlid();
    expect(projectMemberRemovedPayload.parse({ userId })).toEqual({ userId });
  });

  it('planted defect: refuses junk', () => {
    expect(rejectionIssues(projectMemberRemovedPayload.safeParse('usr_1'))).toContainEqual({
      path: [],
      message: 'Expected object, received string',
    });
  });
});

describe('registration in domainRegistry', () => {
  it('binds each workspace, project and membership type to the entity kind its events are about', () => {
    // The registrations are what make these types legal at the door; a schema
    // nobody registered is a vocabulary the ledger will still refuse.
    const expected = [
      ['workspace.created', 'workspace'],
      ['workspace.renamed', 'workspace'],
      ['project.created', 'project'],
      ['membership.granted', 'membership'],
      ['membership.revoked', 'membership'],
      ['project.member_added', 'project'],
      ['project.member_removed', 'project'],
    ] as const;
    for (const [type, entityKind] of expected) {
      const registration = domainRegistry.get(type, 1);
      expect(registration, `${type} is not registered at v1`).toBeDefined();
      expect(registration?.entityKind, `${type} is bound to the wrong kind`).toBe(entityKind);
    }
  });

  it('registers workspace.created exactly once — Plan 4 takes Plan 1’s seed over, it does not re-register it', () => {
    // `register` throws on a duplicate `type@version`, so a second registration
    // would crash at module load rather than fail here. This asserts the seed
    // now carries THIS plan's schema, which is the whole content of "takes over".
    expect(domainRegistry.get('workspace.created', 1)?.payloadSchema).toBe(workspaceCreatedPayload);
    expect(domainRegistry.get('workspace.renamed', 1)?.payloadSchema).toBe(workspaceRenamedPayload);
  });
});
