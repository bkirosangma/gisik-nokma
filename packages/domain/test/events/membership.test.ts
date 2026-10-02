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
      message: 'must not be blank: a name of only spaces names nothing',
    });
    // And the claim survives verbatim: refusing blanks must not become trimming.
    expect(workspaceCreatedPayload.parse({ name: '  Corner  ' })).toEqual({ name: '  Corner  ' });
  });

  /**
   * The workspace prefix (owner spec 2026-09-20). The COMPATIBILITY half is the
   * load-bearing one: every workspace in the ledger was founded before this
   * field existed, so a schema that required it would refuse the entire
   * existing ledger at `parseEvent` — before any of this plan's code ran.
   */
  it('13.1000 — accepts an optional prefix, and an absent one parses unchanged', () => {
    expect(workspaceCreatedPayload.parse({ name: 'Convenience Corner', prefix: 'CC' })).toEqual({
      name: 'Convenience Corner',
      prefix: 'CC',
    });
    // THE COMPATIBILITY HALF — a founding event with no prefix at all.
    expect(workspaceCreatedPayload.parse({ name: 'Convenience Corner' })).toEqual({
      name: 'Convenience Corner',
    });
    // ...and genuinely ABSENT rather than present-and-undefined: a reader using
    // `in` must see "nobody mentioned one", not "mentioned, value unknown".
    expect('prefix' in workspaceCreatedPayload.parse({ name: 'Corner' })).toBe(false);
    // The CONTROL for the line above, same call shape: a key that IS sent is
    // present. Without it, `'prefix' in …` would also pass on a schema that
    // dropped every optional key.
    expect('prefix' in workspaceCreatedPayload.parse({ name: 'Corner', prefix: 'CC' })).toBe(true);
  });

  it('13.1001 — refuses a prefix that is not one to three capitals, and does not upper-case one that is lower', () => {
    for (const prefix of ['ABCD', 'C1', '', '   ', 'C C', 'CC ']) {
      expect(workspaceCreatedPayload.safeParse({ name: 'Corner', prefix }).success).toBe(false);
    }
    expect(
      rejectionIssues(workspaceCreatedPayload.safeParse({ name: 'Corner', prefix: 'cc' })),
    ).toContainEqual({ path: ['prefix'], message: 'must be 1 to 3 capital letters, A to Z' });
    // The refusal must not have quietly rewritten the claim into a legal one.
    expect(
      workspaceCreatedPayload.safeParse({ name: 'Corner', prefix: 'cc' }).success,
    ).toBe(false);
  });
});

describe('workspaceRenamedPayload', () => {
  // Plan 1 seeded this type PROVISIONALLY; Plan 4 takes it over rather than
  // re-registering it, so its shape is pinned here for the first time.
  it('accepts a non-empty name and refuses a blank one', () => {
    expect(workspaceRenamedPayload.parse({ name: 'Corner Shop' })).toEqual({ name: 'Corner Shop' });
    expect(rejectionIssues(workspaceRenamedPayload.safeParse({ name: '  ' }))).toContainEqual({
      path: ['name'],
      message: 'must not be blank: a name of only spaces names nothing',
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

  /**
   * Door A, 2026-09-19 — the project description.
   *
   * **This payload is `.strict()`, and that is what makes OPTIONAL safe:** the
   * key cannot arrive by accident, so "absent" can only mean a caller that did
   * not mention one.
   */
  it('13.976 — accepts an optional description, and an absent one parses unchanged', () => {
    expect(projectCreatedPayload.parse({ name: 'Delivery', description: 'Sprint work' })).toEqual({
      name: 'Delivery',
      description: 'Sprint work',
    });
    // THE COMPATIBILITY HALF. Every `project.created` in the ledger written
    // before this field existed carries no description, and all of them must
    // still parse — the rule this repo applies to every additive wire field.
    expect(projectCreatedPayload.parse({ name: 'Delivery' })).toEqual({ name: 'Delivery' });
    // ...and the key is genuinely ABSENT rather than present-and-undefined. A
    // `.optional()` that left `description: undefined` on the parsed object
    // would read as "mentioned, value unknown" to anything using `in`.
    expect('description' in projectCreatedPayload.parse({ name: 'Delivery' })).toBe(false);
    // The CONTROL for the line above, same call shape: a key that IS sent is
    // present. Without it, `'description' in ...` would also pass on an object
    // that dropped every optional key.
    expect('description' in projectCreatedPayload.parse({ name: 'D', description: 'x' })).toBe(true);
  });

  it('13.977 — refuses a blank description and one over the bound, and does not trim one that has content', () => {
    expect(
      rejectionIssues(projectCreatedPayload.safeParse({ name: 'Delivery', description: '' })),
    ).toContainEqual({
      path: ['description'],
      message: 'String must contain at least 1 character(s)',
    });
    // A description of ONLY SPACES reads as a description everywhere it is
    // displayed while describing nothing — `displayName`'s refusal, one field
    // over.
    expect(
      rejectionIssues(projectCreatedPayload.safeParse({ name: 'Delivery', description: '   ' })),
    ).toContainEqual({
      path: ['description'],
      message: 'must not be blank: a description of only spaces describes nothing',
    });
    expect(
      rejectionIssues(
        projectCreatedPayload.safeParse({ name: 'Delivery', description: 'x'.repeat(501) }),
      ),
    ).toContainEqual({
      path: ['description'],
      message: 'String must contain at most 500 character(s)',
    });
    // The bound is INCLUSIVE, asserted on the boundary itself rather than one
    // either side of it.
    expect(
      projectCreatedPayload.parse({ name: 'Delivery', description: 'x'.repeat(500) }).description,
    ).toHaveLength(500);
    // AS TYPED, not trimmed — the ledger stores the claim as it was made.
    expect(
      projectCreatedPayload.parse({ name: 'Delivery', description: '  Sprint work  ' })
        .description,
    ).toBe('  Sprint work  ');
  });

  /**
   * The project prefix (owner spec 2026-09-20) — `description`'s shape exactly,
   * for `description`'s reason: `.strict()` turns "optional" into "the caller
   * said nothing", and every `project.created` written before this field
   * existed must still parse.
   */
  it('13.1002 — accepts an optional prefix, and an absent one parses unchanged', () => {
    expect(projectCreatedPayload.parse({ name: 'Shop operations', prefix: 'SO' })).toEqual({
      name: 'Shop operations',
      prefix: 'SO',
    });
    // THE COMPATIBILITY HALF — every project in the ledger today.
    expect(projectCreatedPayload.parse({ name: 'Shop operations' })).toEqual({
      name: 'Shop operations',
    });
    expect('prefix' in projectCreatedPayload.parse({ name: 'Shop operations' })).toBe(false);
    // CONTROL, same call shape: a key that IS sent is present.
    expect('prefix' in projectCreatedPayload.parse({ name: 'Shop operations', prefix: 'SO' })).toBe(
      true,
    );
  });

  it('13.1003 — describes and a prefix COEXIST, and a bad prefix is refused by name', () => {
    // The two optional fields are independent; a schema that let the second
    // clobber the first would pass every single-field test above.
    expect(
      projectCreatedPayload.parse({ name: 'Delivery', description: 'Sprint work', prefix: 'DE' }),
    ).toEqual({ name: 'Delivery', description: 'Sprint work', prefix: 'DE' });
    expect(
      rejectionIssues(projectCreatedPayload.safeParse({ name: 'Delivery', prefix: 'delivery' })),
    ).toContainEqual({ path: ['prefix'], message: 'must be 1 to 3 capital letters, A to Z' });
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
      message: 'is required: a project-admin flag is a claim, not a default',
    });
  });

  it('planted defect: refuses a non-boolean projectAdmin — "true" the string is not the claim', () => {
    const result = projectMemberAddedPayload.safeParse({ userId: newUlid(), projectAdmin: 'true' });
    expect(rejectionIssues(result)).toContainEqual({
      path: ['projectAdmin'],
      message: 'is required: a project-admin flag is a claim, not a default',
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
