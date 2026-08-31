### Task 3: Membership and visibility event types in the domain package

**Files:**
- Create: `packages/domain/src/events/membership.ts`
- Create: `packages/domain/src/events/visibility.ts`
- Modify: `packages/domain/src/events/registry.ts` (Plan 1's event-type registry — add seven registrations)
- Modify: `packages/domain/src/index.ts` (export the new types and parsers)
- Test: `packages/domain/test/events/membership.test.ts`
- Test: `packages/domain/test/events/visibility.test.ts`

**Interfaces:**
- Consumes: Plan 1's `registerEventType({type, version, entityKind, parsePayload})` and `parseEvent` (unknown types are refused at ingest — registration is what makes these types legal).
- Produces (all exported from `@gisik-nokma/domain`): `WorkspaceRole = 'owner'|'admin'|'member'|'guest'`; `VisibilityMode = 'workspace'|'project'|'explicit'|'inherit'`; payload interfaces `WorkspaceCreatedPayload {name}`, `ProjectCreatedPayload {name}`, `MembershipGrantedPayload {userId, role}`, `MembershipRevokedPayload {userId}`, `ProjectMemberAddedPayload {userId, projectAdmin}`, `ProjectMemberRemovedPayload {userId}`, `VisibilitySetPayload {ticketId, mode, userIds?}`; parsers `parseWorkspaceCreated`, `parseProjectCreated`, `parseMembershipGranted`, `parseMembershipRevoked`, `parseProjectMemberAdded`, `parseProjectMemberRemoved`, `parseVisibilitySet` — each `(payload: unknown) => <Payload>`, throwing `Error` with a plain message on invalid input.

**Event → entity mapping (a modeling decision, stated once):** `workspace.created` → entity `{kind:'workspace', id: workspaceId}`; `project.created` → `{kind:'project', id: projectId}`; `membership.granted`/`membership.revoked` → `{kind:'membership', id: membershipId(workspaceId, userId)}` — `membershipId` is Plan 2's helper in `@gisik-nokma/domain` (`${workspaceId}:${userId}`), and the id is deterministic because the engine must be able to address a membership from `(workspaceId, actorId)` via `getEntityState('membership', id)` (coordination doc §5); the *scope* stays in the payload, and `proj_memberships` still keys on `(workspaceId, userId, scope)`; `project.member_added`/`project.member_removed` → `{kind:'project', id: projectId}` (they are project-roster history); `visibility.set` → `{kind:'ticket', id: ticketId}` (must equal `payload.ticketId` — Task 9 refuses mismatches).

- [ ] **Step 1: Write the failing membership parser tests**

```ts
// packages/domain/test/events/membership.test.ts
import { describe, expect, it } from 'vitest';
import {
  parseMembershipGranted,
  parseMembershipRevoked,
  parseProjectCreated,
  parseProjectMemberAdded,
  parseProjectMemberRemoved,
  parseWorkspaceCreated,
} from '../../src/events/membership';

describe('parseWorkspaceCreated', () => {
  it('accepts a non-empty name', () => {
    expect(parseWorkspaceCreated({ name: 'Convenience Corner' })).toEqual({ name: 'Convenience Corner' });
  });
  it('refuses a missing or empty name', () => {
    expect(() => parseWorkspaceCreated({})).toThrow(/name/);
    expect(() => parseWorkspaceCreated({ name: '  ' })).toThrow(/name/);
  });
});

describe('parseProjectCreated', () => {
  it('accepts a non-empty name', () => {
    expect(parseProjectCreated({ name: 'Registrations' })).toEqual({ name: 'Registrations' });
  });
  it('refuses junk', () => {
    expect(() => parseProjectCreated(null)).toThrow(/name/);
  });
});

describe('parseMembershipGranted', () => {
  it('accepts a workspace grant', () => {
    expect(parseMembershipGranted({ userId: 'usr_1', role: 'admin' })).toEqual({
      userId: 'usr_1',
      role: 'admin',
    });
  });
  it('refuses an unknown role', () => {
    expect(() => parseMembershipGranted({ userId: 'usr_1', role: 'superuser' })).toThrow(/role/);
  });
  // Planted defect for the 2026-08-27 collapse: a stale client or an old
  // fixture can still send the scope this event used to carry. Accepting and
  // ignoring it would take in a claim meaning "put them on project P" and do
  // something else — the silent acceptance the honesty contract forbids — and
  // it is how the two-ways-on/two-ways-off hole would grow back.
  it('refuses a scope, rather than ignoring one', () => {
    expect(() => parseMembershipGranted({ userId: 'usr_1', role: 'guest', scope: { projectId: 'prj_1' } }))
      .toThrow(/project\.member_added/);
    expect(() => parseMembershipGranted({ userId: 'usr_1', role: 'member', scope: 'workspace' }))
      .toThrow(/project\.member_added/);
  });
});

describe('parseMembershipRevoked', () => {
  it('accepts a userId', () => {
    expect(parseMembershipRevoked({ userId: 'usr_1' })).toEqual({ userId: 'usr_1' });
  });
  it('refuses a missing userId', () => {
    expect(() => parseMembershipRevoked({})).toThrow(/userId/);
  });
  it('refuses a scope, rather than ignoring one', () => {
    expect(() => parseMembershipRevoked({ userId: 'usr_1', scope: { projectId: 'prj_1' } }))
      .toThrow(/project\.member_removed/);
  });
});

describe('parseProjectMemberAdded', () => {
  it('accepts userId and an explicit projectAdmin flag', () => {
    expect(parseProjectMemberAdded({ userId: 'usr_1', projectAdmin: true })).toEqual({
      userId: 'usr_1',
      projectAdmin: true,
    });
  });
  it('refuses a missing projectAdmin flag — the flag is a claim, not a default', () => {
    expect(() => parseProjectMemberAdded({ userId: 'usr_1' })).toThrow(/projectAdmin/);
  });
});

describe('parseProjectMemberRemoved', () => {
  it('accepts a userId', () => {
    expect(parseProjectMemberRemoved({ userId: 'usr_1' })).toEqual({ userId: 'usr_1' });
  });
  it('refuses junk', () => {
    expect(() => parseProjectMemberRemoved('usr_1')).toThrow(/userId/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `packages/domain/`): `pnpm vitest run test/events/membership.test.ts`
Expected: FAIL — cannot resolve `../../src/events/membership`.

- [ ] **Step 3: Implement the membership payloads and parsers**

```ts
// packages/domain/src/events/membership.ts

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

/**
 * Membership is workspace-scoped and nothing else (owner decision 2026-08-27).
 * There was a `MembershipScope = 'workspace' | { projectId }` here, so a person
 * could be put on a project two ways — this event with a project scope, or
 * `project.member_added`. Two ways on means two ways off: `membership.revoked`
 * with a project scope and `project.member_removed` both mean "take them off
 * this project", and unless they wrote the identical projection key, removing
 * by one path left the other standing and an admin believed access was gone
 * when it was not.
 *
 * The project scope also bought nothing. A guest's `canSee` is explicit-only,
 * so it granted no reads, and guests are refused ticket creation before the
 * project check is reached, so it granted no writes. `project.member_added` /
 * `project.member_removed` are now the ONLY project association; guests reach
 * work through `visibility.set` explicit lists, which is what spec §6 says a
 * guest is.
 */
export interface WorkspaceCreatedPayload {
  name: string;
}
export interface ProjectCreatedPayload {
  name: string;
}
export interface MembershipGrantedPayload {
  userId: string;
  role: WorkspaceRole;
}
export interface MembershipRevokedPayload {
  userId: string;
}
export interface ProjectMemberAddedPayload {
  userId: string;
  projectAdmin: boolean;
}
export interface ProjectMemberRemovedPayload {
  userId: string;
}

const ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'member', 'guest']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(record: Record<string, unknown>, field: string, eventType: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${eventType} payload requires a non-empty ${field}`);
  }
  return value;
}

export function parseWorkspaceCreated(payload: unknown): WorkspaceCreatedPayload {
  if (!isRecord(payload)) throw new Error('workspace.created payload requires a non-empty name');
  return { name: requireNonEmptyString(payload, 'name', 'workspace.created') };
}

export function parseProjectCreated(payload: unknown): ProjectCreatedPayload {
  if (!isRecord(payload)) throw new Error('project.created payload requires a non-empty name');
  return { name: requireNonEmptyString(payload, 'name', 'project.created') };
}

export function parseMembershipGranted(payload: unknown): MembershipGrantedPayload {
  if (!isRecord(payload)) throw new Error('membership.granted payload requires userId and role');
  const userId = requireNonEmptyString(payload, 'userId', 'membership.granted');
  const role = payload.role;
  if (typeof role !== 'string' || !ROLES.has(role)) {
    throw new Error("membership.granted payload requires role 'owner'|'admin'|'member'|'guest'");
  }
  // A `scope` is REFUSED rather than ignored. These events used to carry one,
  // so a stale client or an old fixture can still send it — and silently
  // dropping it would accept a claim meaning "put them on project P" while
  // doing something else entirely, which is the quiet acceptance the honesty
  // contract exists to prevent. Project membership is project.member_added.
  if ('scope' in payload) {
    throw new Error('membership.granted no longer takes a scope; use project.member_added to put someone on a project');
  }
  return { userId, role: role as WorkspaceRole };
}

export function parseMembershipRevoked(payload: unknown): MembershipRevokedPayload {
  if (!isRecord(payload)) throw new Error('membership.revoked payload requires userId');
  if ('scope' in payload) {
    throw new Error('membership.revoked no longer takes a scope; use project.member_removed to take someone off a project');
  }
  return {
    userId: requireNonEmptyString(payload, 'userId', 'membership.revoked'),
  };
}

export function parseProjectMemberAdded(payload: unknown): ProjectMemberAddedPayload {
  if (!isRecord(payload)) throw new Error('project.member_added payload requires userId and projectAdmin');
  const userId = requireNonEmptyString(payload, 'userId', 'project.member_added');
  if (typeof payload.projectAdmin !== 'boolean') {
    throw new Error('project.member_added payload requires a boolean projectAdmin');
  }
  return { userId, projectAdmin: payload.projectAdmin };
}

export function parseProjectMemberRemoved(payload: unknown): ProjectMemberRemovedPayload {
  if (!isRecord(payload)) throw new Error('project.member_removed payload requires userId');
  return { userId: requireNonEmptyString(payload, 'userId', 'project.member_removed') };
}
```

- [ ] **Step 4: Run the membership tests to verify they pass**

Run (from `packages/domain/`): `pnpm vitest run test/events/membership.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Write the failing visibility parser tests**

```ts
// packages/domain/test/events/visibility.test.ts
import { describe, expect, it } from 'vitest';
import { parseVisibilitySet } from '../../src/events/visibility';

describe('parseVisibilitySet', () => {
  it('accepts workspace, project, and inherit modes without userIds', () => {
    for (const mode of ['workspace', 'project', 'inherit'] as const) {
      expect(parseVisibilitySet({ ticketId: 'tkt_1', mode })).toEqual({ ticketId: 'tkt_1', mode });
    }
  });

  it('accepts explicit mode with a non-empty userIds list', () => {
    expect(parseVisibilitySet({ ticketId: 'tkt_1', mode: 'explicit', userIds: ['usr_1', 'usr_2'] })).toEqual({
      ticketId: 'tkt_1',
      mode: 'explicit',
      userIds: ['usr_1', 'usr_2'],
    });
  });

  it('refuses explicit mode without userIds — an audience of nobody is not a claim', () => {
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'explicit' })).toThrow(/userIds/);
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'explicit', userIds: [] })).toThrow(/userIds/);
  });

  it('refuses userIds on non-explicit modes — a list nobody reads would be a silent lie', () => {
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'project', userIds: ['usr_1'] })).toThrow(/userIds/);
  });

  it('refuses an unknown mode', () => {
    expect(() => parseVisibilitySet({ ticketId: 'tkt_1', mode: 'secret' })).toThrow(/mode/);
  });

  it('refuses a missing ticketId', () => {
    expect(() => parseVisibilitySet({ mode: 'project' })).toThrow(/ticketId/);
  });
});
```

- [ ] **Step 6: Run to verify failure, then implement**

Run (from `packages/domain/`): `pnpm vitest run test/events/visibility.test.ts` — Expected: FAIL (module missing). Then:

```ts
// packages/domain/src/events/visibility.ts

export type VisibilityMode = 'workspace' | 'project' | 'explicit' | 'inherit';

export interface VisibilitySetPayload {
  ticketId: string;
  mode: VisibilityMode;
  userIds?: string[];
}

const MODES: ReadonlySet<string> = new Set(['workspace', 'project', 'explicit', 'inherit']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseVisibilitySet(payload: unknown): VisibilitySetPayload {
  if (!isRecord(payload) || typeof payload.ticketId !== 'string' || payload.ticketId.trim() === '') {
    throw new Error('visibility.set payload requires a non-empty ticketId');
  }
  const mode = payload.mode;
  if (typeof mode !== 'string' || !MODES.has(mode)) {
    throw new Error("visibility.set payload requires mode 'workspace'|'project'|'explicit'|'inherit'");
  }
  if (mode === 'explicit') {
    const userIds = payload.userIds;
    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every((u) => typeof u === 'string' && u.trim() !== '')
    ) {
      throw new Error('visibility.set with explicit mode requires a non-empty userIds list');
    }
    return { ticketId: payload.ticketId, mode, userIds };
  }
  if (payload.userIds !== undefined) {
    throw new Error(`visibility.set with mode '${mode}' must not carry userIds`);
  }
  return { ticketId: payload.ticketId, mode: mode as VisibilityMode };
}
```

Run again — Expected: PASS (6 tests).

- [ ] **Step 7: Register all seven event types**

In Plan 1's `packages/domain/src/events/registry.ts`, add (adapting the call shape to the registry's actual signature — the semantic content below is fixed):

```ts
import {
  parseMembershipGranted,
  parseMembershipRevoked,
  parseProjectCreated,
  parseProjectMemberAdded,
  parseProjectMemberRemoved,
  parseWorkspaceCreated,
} from './membership';
import { parseVisibilitySet } from './visibility';

registerEventType({ type: 'workspace.created', version: 1, entityKind: 'workspace', parsePayload: parseWorkspaceCreated });
registerEventType({ type: 'project.created', version: 1, entityKind: 'project', parsePayload: parseProjectCreated });
registerEventType({ type: 'membership.granted', version: 1, entityKind: 'membership', parsePayload: parseMembershipGranted });
registerEventType({ type: 'membership.revoked', version: 1, entityKind: 'membership', parsePayload: parseMembershipRevoked });
registerEventType({ type: 'project.member_added', version: 1, entityKind: 'project', parsePayload: parseProjectMemberAdded });
registerEventType({ type: 'project.member_removed', version: 1, entityKind: 'project', parsePayload: parseProjectMemberRemoved });
registerEventType({ type: 'visibility.set', version: 1, entityKind: 'ticket', parsePayload: parseVisibilitySet });
```

Also export everything from `packages/domain/src/index.ts`:

```ts
export * from './events/membership';
export * from './events/visibility';
```

- [ ] **Step 8: Run the full domain suite**

Run (from `packages/domain/`): `pnpm vitest run`
Expected: PASS — Plan 1's registry/parseEvent tests still green (proving the seven registrations are well-formed), plus the 19 new tests.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/events packages/domain/src/index.ts packages/domain/test/events
git commit -m "Membership and visibility claims parse at the door: seven event types the ledger can replay — workspaces, projects, grants, revocations, rosters, and who may see a ticket."
```

---

