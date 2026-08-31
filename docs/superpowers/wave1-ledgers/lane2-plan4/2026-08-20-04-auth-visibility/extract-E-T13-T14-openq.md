# Extract E — Plan 4 lines 4924–5300: Task 13, Task 14, Open Questions

Source: `docs/superpowers/plans/2026-08-20-04-auth-visibility.md` lines 4924–5300.

---

## Task 13: The founding route — `POST /v1/workspaces`

Route prefix note (stated once in this task): whole product API lives under `/v1/*` (coordination doc amendment 20). `/api/auth/*` is the only exception (better-auth vendor surface). Task 8's ticket read routes were originally `/api/workspaces/...`, moved to `/v1/workspaces/...` on 2026-08-27.

### Files
- Create: `apps/server/src/routes/workspaces.ts`
- Modify: `apps/server/src/app.ts` (register route alongside ticket routes)
- Modify: `Features.md` (§6, founding bullet), `test-cases/06-auth-visibility.md` (cases 6.23–6.25, plus 6.26–6.31 also appended here per plan text, and 6.41 later in Task 14's block)
- Test: `apps/server/test/routes/workspaces.test.ts`

### Interfaces — Consumes
- `makeRequireSession` (Task 2)
- the ingest path (Task 5's wiring — route submits through it so `bootstrapWorkspace` fires, same as Plan 11's seed CLIs)
- `newUlid` from `@gisik-nokma/domain`
- `IngestService` type from `../ingest/ingest-service` (comment: "Plan 1's ingest entry point — adapt the name")
- `buildApp` from `../../src/app` (test helper import; comment: "Plan 1's app builder — adapt name/signature")
- `migrateTestDb`, `testPool`, `truncateAll` from `../helpers/db`
- `signInWithPhone` from `../helpers/session`
- `SubmittedEvent` type from `@gisik-nokma/domain`
- `Auth` type from `../auth/auth`

### Interfaces — Produces
```ts
registerWorkspaceRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth; ingest: IngestService }): void
```
Serves:
- `POST /v1/workspaces` — body `{ name: string }` → `201 { workspaceId: string }`, or the ingest layer's own refusal/invalid body verbatim (422 with `result` body when `result.status !== 'committed'`; 400 with `{ error: 'invalid', message: 'A workspace needs a name.' }` for empty/whitespace name).
- Added Step 4b: `GET /v1/me/workspaces` → `{ workspaces: [{ workspaceId, name, role }] }` (no separate export named for this — implemented inline in the same route registration closure in `routes/workspaces.ts`).

### Route implementation details (verbatim behavior)
- `workspaceId = newUlid()` — workspace's id IS its founding entity's id.
- `founding: SubmittedEvent` — `type: 'workspace.created'`, `version: 1`, `payload: { name: name.trim() }`, `actorId: request.currentUserId`, `origin: 'web'`, `clientTime: new Date().toISOString()`. Comment: origin is caller's not 'server' because `checkRolePermission` (Task 5) refuses a borrowed server origin; actorId must equal session user for same reason; gate lets `workspace.created` through without a membership.
- Calls `deps.ingest.ingestBatch([founding], { sessionUserId: request.currentUserId })`; destructures `[result]`; `if (result === undefined) throw new Error('ingest returned no result for the founding event')`.
- `GET /v1/me/workspaces` queries `proj_memberships` (`SELECT workspace_id, role FROM proj_memberships WHERE user_id = $1 AND scope_kind = 'workspace' ORDER BY workspace_id`), and for each row calls `workspaceNameFromLedger(deps.pool, row.workspace_id)` — described as "Task 14's helper — latest workspace.created/renamed" (NOTE: contradiction — Task 13's own comment attributes `workspaceNameFromLedger` to Task 14, but Task 13 code uses it directly; see Cross-task flags below).

### Step 1 test file — full content (verbatim)
```ts
// apps/server/test/routes/workspaces.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app'; // Plan 1's app builder — adapt name/signature
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { signInWithPhone } from '../helpers/session';

let pool: Pool;
let app: FastifyInstance;

describe('POST /v1/workspaces', () => {
  beforeAll(async () => {
    migrateTestDb();
    pool = testPool();
    app = await buildApp({ pool });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('founds a workspace and returns its id', async () => {
    const { token } = await signInWithPhone('+919000000201');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Convenience Corner' },
    });
    expect(res.statusCode).toBe(201);
    const { workspaceId } = res.json() as { workspaceId: string };
    expect(workspaceId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('the founded workspace arrives usable — owner, a workflow, and all four built-in types', async () => {
    const { token, userId } = await signInWithPhone('+919000000202');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Convenience Corner' },
    });
    const { workspaceId } = res.json() as { workspaceId: string };

    const role = await pool.query(
      'SELECT role FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = $3',
      [workspaceId, userId, 'workspace'],
    );
    expect(role.rows).toEqual([{ role: 'owner' }]);

    const workflows = await pool.query('SELECT workflow_id FROM proj_workflows WHERE workspace_id = $1', [workspaceId]);
    expect(workflows.rows).toHaveLength(1);
    const types = await pool.query(
      'SELECT type_id, workflow_id FROM proj_ticket_types WHERE workspace_id = $1 ORDER BY rank',
      [workspaceId],
    );
    expect(types.rows.map((row) => row.type_id)).toEqual(['epic', 'story', 'task', 'sub-task']);
    for (const row of types.rows) {
      expect(row.workflow_id).toBe(workflows.rows[0].workflow_id);
    }
  });

  it('a request with no session is refused with the generic 401 — founding needs a signed-in person', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/workspaces', payload: { name: 'Nobody' } });
    expect(res.statusCode).toBe(401);
  });

  it('a nameless workspace is refused, and nothing is appended', async () => {
    const { token } = await signInWithPhone('+919000000203');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events');
    expect(rows[0].n).toBe(0);
  });
});
```

### Route implementation — full code (verbatim)
```ts
// apps/server/src/routes/workspaces.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Auth } from '../auth/auth';
import { makeRequireSession } from '../auth/require-session';
import type { IngestService } from '../ingest/ingest-service'; // Plan 1's ingest entry point — adapt the name

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; auth: Auth; ingest: IngestService },
): void {
  const requireSession = makeRequireSession(deps.auth);

  app.post('/v1/workspaces', { preHandler: requireSession }, async (request, reply) => {
    const { name } = (request.body ?? {}) as { name?: unknown };
    if (typeof name !== 'string' || name.trim() === '') {
      return reply.code(400).send({ error: 'invalid', message: 'A workspace needs a name.' });
    }

    const workspaceId = newUlid();
    const founding: SubmittedEvent = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.created',
      version: 1,
      payload: { name: name.trim() },
      actorId: request.currentUserId,
      origin: 'web',
      clientTime: new Date().toISOString(),
    };

    const [result] = await deps.ingest.ingestBatch([founding], { sessionUserId: request.currentUserId });
    if (result === undefined) throw new Error('ingest returned no result for the founding event');
    if (result.status !== 'committed') return reply.code(422).send(result); // refusal/invalid body verbatim
    return reply.code(201).send({ workspaceId });
  });
}
```

Register at same place Task 8's ticket routes are registered, in `apps/server/src/app.ts`.

### Step 4b addition — `GET /v1/me/workspaces` — full code (verbatim)
```ts
// GET /v1/me/workspaces → { workspaces: [{ workspaceId, name, role }] }
// proj_memberships holds the person's workspace-scope rows; the name comes
// from workspaceNameFromLedger (Task 14's helper — latest workspace.created/
// renamed), which collapses into a workspace projection if one ever grows.
app.get('/v1/me/workspaces', { preHandler: requireSession }, async (request) => {
  const { rows } = await deps.pool.query(
    `SELECT workspace_id, role FROM proj_memberships
     WHERE user_id = $1 AND scope_kind = 'workspace' ORDER BY workspace_id`,
    [request.currentUserId],
  );
  const workspaces = [];
  for (const row of rows as Array<{ workspace_id: string; role: string }>) {
    workspaces.push({
      workspaceId: row.workspace_id,
      name: await workspaceNameFromLedger(deps.pool, row.workspace_id),
      role: row.role,
    });
  }
  return { workspaces };
});
```
Added at Plan 6's walk (2026-08-27) — gap found because Plan 6's navigation codes against this route and its Playwright smoke mocks it, but no plan served it.

Step 4b tests (not full code, described): a member of two workspaces lists both with names and roles; a guest lists their guest workspace; no session → 401; a revoked membership disappears from the directory on the next call (read is `proj_memberships`, revocation deletes the row).

### Steps
- Step 2: `pnpm vitest run test/routes/workspaces.test.ts` — Expected FAIL: 404 on the route.
- Step 4: same command — Expected PASS (4 tests).
- Step 5: Features.md §6 append (verbatim):
  > `- ✅ **Founding a workspace** — `POST /v1/workspaces` takes a name from any signed-in person and returns a workspace that already works: the simple-Kanban default workflow, all four built-in ticket types bound to it, and the founder recorded as owner — appended in that order, because a ticket type naming an undefined workflow is refused. The template is a starting point, not a commitment: an admin may publish another workflow and re-point the types immediately. Beside it, `GET /v1/me/workspaces` is the directory: the workspaces this person belongs to, with names and roles, straight from `proj_memberships`. `apps/server/src/routes/workspaces.ts`, `apps/server/src/workspaces/bootstrap-workspace.ts``

  NOTE: this bullet references `apps/server/src/workspaces/bootstrap-workspace.ts` as a file path — not listed in Task 13's own Files section (it belongs to Task 5). Flag for adaptation map to confirm it exists.

- test-cases/06-auth-visibility.md append — cases 6.23–6.31 (verbatim):
```
- **6.23** ✅ `POST /v1/workspaces` founds a workspace for any signed-in person and returns its id; no session gets the generic 401; a nameless workspace is refused and appends nothing. (`test/routes/workspaces.test.ts`)
- **6.24** ✅ Founding appends the default workflow, then the four built-in types naming it, then the founder's owner grant — asserted in `workspace_seq` order, because the sequence spans four entity kinds and per-entity `seq` cannot order it. (`test/permissions/check-role-permission.test.ts`)
- **6.25** ✅ A founded workspace accepts a ticket immediately: found → project → roster → `ticket.created` is committed and lands in the default workflow's initial state. Before the bootstrap this refused `ticket.unknown-type` and the workspace was permanently unusable. (`test/permissions/check-role-permission.test.ts`)
- **6.26** ✅ Planted defect: re-submitting the same founding event id answers `duplicate-event-id` and bootstraps nothing a second time — the property both of Plan 11's seed CLIs re-run on. (`test/permissions/check-role-permission.test.ts`)
- **6.27** ✅ `project.created` lands a `proj_projects` row scoped to its workspace and carrying its creator; a re-delivered duplicate does not double-insert; `reset` empties the table. (`test/projections/proj-projects.test.ts`)
- **6.28** ✅ `projectExists` answers `false` for a real project id asked under a different workspace — project ids are not globally unique keys to anyone who knows one. (`test/projections/proj-projects.test.ts`)
- **6.29** ✅ Planted defect, and the one the hole was actually reachable through: a membership granted on a `projectId` that was never founded no longer lets a ticket be created into it. The refusal is `project.unknown`; the test asserts the rule name, because being refused for the wrong reason is what this check exists to remove. (`test/permissions/check-project-exists.test.ts`)
- **6.30** ✅ Ordering: a non-member creating a ticket in a project that does not exist is told the project does not exist, not that they are not a member — the existence check runs before the membership check. (`test/permissions/check-project-exists.test.ts`)
- **6.31** ✅ `ticket.workflow_rebound` is admin-only: a plain member's migration is refused `permission.role`, an admin's passes the gate. Migration re-homes work other people are holding, so it is not an ordinary ticket edit. (`test/permissions/check-role-permission.test.ts`)
```

- Step 6: Commit — files staged: `apps/server/src/routes/workspaces.ts apps/server/src/app.ts apps/server/test/routes/workspaces.test.ts Features.md test-cases/06-auth-visibility.md`. Commit message (verbatim): "A workspace can now be founded through the product, and it arrives able to hold a ticket: one name in, and the default workflow, the four built-in types and the founder's ownership come back out."

### Refusals in Task 13
| Rule/status | Reason/body |
|---|---|
| 400 | `{ error: 'invalid', message: 'A workspace needs a name.' }` (empty/whitespace name) |
| 401 | generic (no session) |
| 422 | ingest layer's own refusal `result` sent verbatim when `result.status !== 'committed'` |
| `duplicate-event-id` | (case 6.26) re-submitting founding event id |
| `project.unknown` | (case 6.29, cross-task) membership on unfounded project |
| `permission.role` | (case 6.31, cross-task) plain member migrating `ticket.workflow_rebound` |

### Test count
Step 1: 4 tests explicit in file. Step 4b adds tests for `GET /v1/me/workspaces` (count not stated numerically — described as 4 scenarios: two-workspace member, guest, no-session 401, revoked-membership disappearance). Test-cases appended: 6.23–6.31 (9 case entries, several referencing pre-existing test files not created by this task).

### planTextClaimsToVerify (Task 13)
- `apps/server/src/app.ts` exists and has a place "where Task 8's ticket routes are registered."
- `apps/server/src/auth/require-session.ts` exports `makeRequireSession(auth: Auth): preHandler`.
- `apps/server/src/auth/auth.ts` exports type `Auth`.
- `apps/server/src/ingest/ingest-service.ts` exports type `IngestService` with method `ingestBatch(events: SubmittedEvent[], opts: { sessionUserId: string }): Promise<Result[]>` where each `Result` has `.status` (`'committed'` or other) — the route treats non-`'committed'` results as sendable-verbatim refusal bodies.
- `@gisik-nokma/domain` exports `newUlid()` and type `SubmittedEvent` with fields `id, workspaceId, entity: {kind, id}, type, version, payload, actorId, origin, clientTime`.
- `apps/server/test/helpers/db.ts` exports `migrateTestDb`, `testPool`, `truncateAll`.
- `apps/server/test/helpers/session.ts` exports `signInWithPhone(phone: string): Promise<{ token: string; userId: string }>`.
- `apps/server/src/app.ts` exports `buildApp({ pool: Pool }): Promise<FastifyInstance>` (comment flags this as an assumption to adapt).
- DB tables: `proj_memberships` (columns `workspace_id, user_id, scope_kind, role`), `proj_workflows` (`workflow_id, workspace_id`), `proj_ticket_types` (`type_id, workflow_id, workspace_id, rank`), `events` (has a countable row set), `proj_projects` (referenced in case 6.27/6.28 but not in Task 13 files — cross-task).
- Built-in ticket type ids on founding: exactly `['epic', 'story', 'task', 'sub-task']`, all bound to one workflow, ordered by `rank`.
- ULID format regex used in test: `/^[0-9A-HJKMNP-TV-Z]{26}$/`.
- `apps/server/src/workspaces/bootstrap-workspace.ts` exists (named in Features.md bullet, not in Task 13's Files list — belongs to Task 5 per plan cross-references).
- `workspaceNameFromLedger` helper exists and Task 13 code calls it even though prose attributes its authorship to "Task 14's helper."

---

## Task 14: Invites — the address-named claim, and the token that is not history

Context: Spec §6 promises invites via links/QR from an admin. Plan 6 (client) owns `/invite/[token]` page + `InviteGateway`; **routes below are Plan 6's contract, consumed verbatim — do not rename them.**

### Two design lines (verbatim)
1. Token is a credential — not the event id, never enters the ledger (hashed at rest like better-auth's own token tables). Ledger records that an invitation was made, to what address, by whom — not the secret that opens it.
2. An invite is a claim like everything else — attributed, dated, visible as pending until accepted, revocation is itself an event. Acceptance is recorded by the server (not client-submittable) when the invited person opens their link and authenticates (existing OTP/magic-link/Google paths; no new auth).

### Files
- Create: `packages/domain/src/events/invites.ts` (payloads, parsers, registrations)
- Create: `apps/server/migrations/<ts>_proj-invites.cjs` (two tables in one migration: `proj_invites` projection + server-owned `invite_tokens`)
- Create: `apps/server/src/projections/proj-invites.ts`, `apps/server/src/routes/invites.ts`
- Modify: `apps/server/src/permissions/check-permission.ts` (gates), `apps/server/src/sync/visible-events.ts` (`invite` entity kind), `apps/server/src/app.ts`, `apps/server/src/projections/index.ts` (register `projInvites`, slotted after `proj_memberships` per coordination §8 amendment)
- Test: `packages/domain/test/events/invites.test.ts`, `apps/server/test/routes/invites.test.ts`

### Interfaces — Consumes
- `makeRequireSession` (Task 2)
- the ingest path (Task 5's wiring)
- `checkRolePermission` context (Task 5)
- `visibleEventsFor` (Task 11)
- `newUlid` (Plan 1)
- `AppConfig` — gains `webOrigin` (env var `WEB_ORIGIN`; picked up by Plan 11's `.env.example` completeness gate)

### Interfaces — Produces
```ts
interface InviteSentPayload { inviteId; address; channel: 'email' | 'phone'; role: 'admin' | 'member' | 'guest'; projectIds?: string[] }
interface InviteAcceptedPayload { inviteId; userId }
interface InviteRevokedPayload { inviteId }
```
Plus their parsers. Event types `invite.sent` / `invite.accepted` / `invite.revoked` v1, `entityKind: 'invite'`, entity id = `inviteId`.

```ts
registerInviteRoutes(app, deps)
```
Serving:
- `POST /v1/workspaces/:workspaceId/invites` → `201 { inviteId, url }` (admin-only)
- `GET /v1/invites/:token` → `InviteSummary { workspaceId, workspaceName, role }` or 404 (no session required — token is the credential)
- `POST /v1/invites/:token/accept` → `{ workspaceId }` (session required)
- `GET /v1/workspaces/:workspaceId/invites` → `{ invites: [{ inviteId, address, channel, role, projectIds, invitedBy, invitedAt }] }` (admin-only; added at Plan 6's walk 2026-08-27)

### Payload parser code — `parseInviteSent` full (verbatim)
```ts
const INVITE_ROLES = new Set(['admin', 'member', 'guest']);
const INVITE_CHANNELS = new Set(['email', 'phone']);

export function parseInviteSent(payload: unknown): InviteSentPayload {
  if (!isRecord(payload)) throw new Error('invite.sent payload requires inviteId, address, channel, role');
  const inviteId = requireNonEmptyString(payload, 'inviteId', 'invite.sent');
  const address = requireNonEmptyString(payload, 'address', 'invite.sent');
  const { channel, role } = payload;
  if (typeof channel !== 'string' || !INVITE_CHANNELS.has(channel)) {
    throw new Error("invite.sent payload requires channel 'email' or 'phone'");
  }
  if (typeof role !== 'string' || !INVITE_ROLES.has(role)) {
    // 'owner' is refused by omission, and deliberately: an invitation cannot
    // make somebody the owner of a workspace they have not yet entered.
    throw new Error("invite.sent payload requires role 'admin'|'member'|'guest' — an invite cannot confer ownership");
  }
  let projectIds: string[] | undefined;
  if ('projectIds' in payload) {
    if (!Array.isArray(payload.projectIds) || payload.projectIds.some((p) => typeof p !== 'string' || p === '')) {
      throw new Error('invite.sent projectIds must be non-empty strings');
    }
    if (role === 'guest') {
      throw new Error('invite.sent cannot put a guest on a project; share tickets with visibility.set instead');
    }
    projectIds = payload.projectIds as string[];
  }
  return { inviteId, address, channel: channel as 'email' | 'phone', role: role as 'admin' | 'member' | 'guest', projectIds };
}
```
`parseInviteAccepted` and `parseInviteRevoked`: shape checks only (`inviteId`, `userId` non-empty) — no full code given, described only.

Entity id must equal `payload.inviteId` for each event; refused at parse otherwise (same mismatch rule as Task 9's `visibility.set`) — exact refusal message for this mismatch NOT given in this range (references Task 9's rule by pointer, not verbatim here).

### Gates (`check-permission.ts`) — three additions (verbatim reasons)
1. `invite.sent` and `invite.revoked` join `ADMIN_ONLY_TYPES`.
2. `invite.accepted` refused from **every** client origin with rule `permission.role` and reason: **"Acceptance is recorded by the server when the invited person opens their link."** — planted defect test: admin submitting `invite.accepted { inviteId, userId: themselves }` is refused.
3. (Implicit third — sync-down, listed separately below) new `case 'invite':` in `visible-events.ts` yields only to `owner`/`admin`.

### Refusals table — Task 14 (verbatim)
| Rule / status | Message (verbatim) |
|---|---|
| Error (parse) | `invite.sent payload requires inviteId, address, channel, role` |
| Error (parse) | `invite.sent payload requires channel 'email' or 'phone'` |
| Error (parse) | `invite.sent payload requires role 'admin'\|'member'\|'guest' — an invite cannot confer ownership` |
| Error (parse) | `invite.sent projectIds must be non-empty strings` |
| Error (parse) | `invite.sent cannot put a guest on a project; share tickets with visibility.set instead` |
| `permission.role` (gate) | `Acceptance is recorded by the server when the invited person opens their link.` |
| `410` | non-pending invite on accept route (no message string given, only status code) |
| `404` | `GET /v1/invites/:token` for unknown, revoked, accepted, or invalid-shaped-but-unknown token — "indistinguishable... one 404 body" (exact JSON body not specified in this range) |
| `permission.role` (route) | plain member calling `GET /v1/workspaces/:workspaceId/invites` |

### Projection + token store code (verbatim)
```ts
// proj_invites — rebuildable from the ledger like every projection:
//   invite_id PK, workspace_id, address, channel, role, project_ids jsonb,
//   status 'pending'|'accepted'|'revoked', invited_by, invited_at,
//   accepted_user_id NULL, accepted_at NULL
// invite_tokens — NOT a projection and NEVER rebuildable from the ledger,
//   because the token is not in the ledger (that is the point):
//   invite_id PK, token_hash text NOT NULL UNIQUE, created_at
export const projInvites = {
  name: 'proj_invites',
  tables: ['proj_invites'] as const, // invite_tokens is deliberately absent: reset() must not touch it
  async apply(env: LedgerEvent, db: Queryable): Promise<void> {
    if (env.type === 'invite.sent') { /* INSERT ... ON CONFLICT DO NOTHING */ }
    if (env.type === 'invite.accepted') { /* status='accepted', accepted_user_id, accepted_at */ }
    if (env.type === 'invite.revoked') { /* status='revoked' */ }
  },
  async reset(db: Queryable): Promise<void> { await db.query('DELETE FROM proj_invites'); },
};
```
(NOTE: `apply` bodies are code comments only, not full implementations — flag for adaptation map.)

### Routes behavior (described, not full code)
- `POST /v1/workspaces/:workspaceId/invites` `{ address, channel, role, projectIds? }`: mints `inviteId = newUlid()` and a 32-byte random token; submits `invite.sent` through ingest gate as session user; on commit, stores `sha256(token)` in `invite_tokens` in same transaction; answers `201 { inviteId, url: \`${config.webOrigin}/invite/${token}\` }`. Raw token exists only in this response.
- `GET /v1/invites/:token`: hashes token, looks up invite, joins `proj_invites`; answers `InviteSummary` for pending invite, 404 otherwise. `workspaceName` from `workspaceNameFromLedger(db, workspaceId)` — "latest `workspace.created`/`workspace.renamed` name in the events table."
- `POST /v1/invites/:token/accept`: requires session; hashes/resolves token; refuses non-pending (`410`); appends server-origin through same append+project path as founding, in order: `invite.accepted { inviteId, userId: session.userId }`, `membership.granted { userId, role }`, one `project.member_added { userId, projectAdmin: false }` per promised project. All appended events `actorId` = accepting user. Deletes token row same transaction. Answers `{ workspaceId }`.
- `invite.revoked`: no dedicated route — admin submits via `POST /v1/events` like any claim; projection flips status.
- `GET /v1/workspaces/:workspaceId/invites`: admin-only; `{ invites: [...] }` from `proj_invites WHERE status = 'pending'`, newest first; no tokens in response.

### Planted defects (Steps 1–4, verbatim list)
- plain member calling invite route refused `permission.role`
- client-submitted `invite.accepted` refused even from an admin (token-bypass defect)
- `GET` with valid-shaped-but-unknown token, a revoked token, and a spent token all answer identical 404 body
- accepting twice: second answers `410` and appends nothing (assert event count)
- credential-separation defect: committed `invite.sent`'s event id and its `inviteId` used as tokens — both must 404
- accepted member invite lands `membership.granted` + `project.member_added` rows; new member's next request can read a ticket in the promised project
- accepted guest invite lands the grant alone, `eff.projects` empty

### Step 5: Features.md §6 append (verbatim)
```markdown
- ✅ **Invites** — an admin invites a person by address (email or phone), not by user id, so someone who has never signed in can be brought in: `invite.sent` is the attributed claim, the link's token is server-owned and hashed (never in the ledger — reading history confers nothing), and acceptance on landing creates the account if needed, binds the invite, and appends the membership it promised. Revocation is an event; a dead link never says why it is dead. An invite cannot confer ownership, and a guest invite cannot carry projects. `apps/server/src/routes/invites.ts`, `packages/domain/src/events/invites.ts`
```

### test-cases/06-auth-visibility.md append — cases 6.32–6.42 (verbatim)
```markdown
- **6.32** ✅ An admin invites by address; the response carries the one copy of the raw token; the ledger, the projections and the logs carry only the claim and the hash. (`test/routes/invites.test.ts`)
- **6.33** ✅ Planted defect: a plain member issuing an invite is refused `permission.role`; a guest invite carrying projectIds is refused at parse with the visibility.set remedy named. (`test/routes/invites.test.ts`, `test/events/invites.test.ts`)
- **6.34** ✅ Planted defect: client-submitted `invite.accepted` is refused even from an admin — acceptance without the token would bind any pending invite to any user. (`test/permissions/check-role-permission.test.ts`)
- **6.35** ✅ The credential-separation defect: the committed invite's event id and its inviteId both 404 as tokens. Reading the workspace's history confers nothing. (`test/routes/invites.test.ts`)
- **6.36** ✅ Unknown, revoked and spent tokens are indistinguishable: one 404 body. Accepting twice appends nothing the second time. (`test/routes/invites.test.ts`)
- **6.37** ✅ Acceptance appends invite.accepted, the grant, and the promised project rows in order, all actor-attributed to the acceptor, authorization tracing to the admin's invite.sent; the new member can immediately read a ticket in the promised project. (`test/routes/invites.test.ts`)
- **6.38** ✅ `invite.sent` reaches owners and admins in sync-down and nobody else — the address is PII and members have no need of it. (`test/sync/visible-events.test.ts`)
- **6.39** ✅ The owner reads everything in the workspace, including explicit lists naming only others; an admin still reads nothing they have not joined or been listed for — the split IS the planted defect, since a regression re-unifying the two roles fails one side. (Task 7 amendment, owner decision 2026-08-27; `test/visibility/can-see.test.ts`)
- **6.40** ✅ An owner on no project and no list receives every ticket from `listVisibleTickets`, and `canSee` agrees ticket by ticket — the drift alarm between the decision table's two copies (pure function and SQL). (`test/visibility/visible-tickets.test.ts`)
- **6.41** ✅ `GET /v1/me/workspaces` lists the caller's workspaces with names and roles; a guest is told where they are a guest; a revoked membership vanishes from the directory on the next call. Added at Plan 6's walk, which found its own navigation coded against a route no plan served. (`test/routes/workspaces.test.ts`)
- **6.42** ✅ `GET /v1/workspaces/:workspaceId/invites` lists pending invites to admins, never re-serves a token, and refuses plain members `permission.role` — the same PII rule as sync-down, applied to the read path. (`test/routes/invites.test.ts`)
```
NOTE: cases 6.39 and 6.40 concern Task 7 (visibility owner-bypass), not Task 14, but are appended in Task 14's Step 5 block per the plan text — reproduced verbatim above as written.

### Step 6: Commit message (verbatim)
"Invites name an address rather than a user id, and the secret that opens one is not history: the ledger records who invited whom, the token lives hashed beside the sessions, and reading a workspace's past confers nothing about entering its future."

### Test count (Task 14)
No single explicit "N tests" count given for the code files (unlike Task 13's "4 tests"). Counted by named scenario: 7 planted-defect scenarios (Steps 1–4) + test-cases 6.32–6.42 = 11 case entries (6.32–6.42), 2 of which (6.39, 6.40) belong to Task 7 per their own text.

### planTextClaimsToVerify (Task 14)
- `packages/domain/src/events/invites.ts` does not yet exist (to be created).
- `apps/server/src/permissions/check-permission.ts` exists and exports `ADMIN_ONLY_TYPES` (a Set/array `invite.sent`/`invite.revoked` are joined to).
- `apps/server/src/sync/visible-events.ts` exists with a switch statement over entity kind, default-deny shape, to receive a new `case 'invite':`.
- `apps/server/src/projections/index.ts` exists with a registration list where `proj_memberships` appears, to slot `projInvites` after it (coordination doc §8 amendment).
- Better-auth's own token tables exist and are hashed-at-rest (referenced as the precedent pattern).
- `AppConfig` type exists and needs a `webOrigin` field sourced from `WEB_ORIGIN` env var; Plan 11's `.env.example` completeness gate exists and checks env vars.
- `workspaceNameFromLedger(db, workspaceId)` helper — same claim as in Task 13, needs single canonical implementation location (see cross-task flag).
- `proj_memberships` table accepts `membership.granted { userId, role }` shaped events.
- `project.member_added { userId, projectAdmin: false }` event type exists (Task 5/9 domain).
- `Refusal`/rule-name shape `permission.role` used identically per plan's own self-review claim (cross-task, Tasks 5/9/12).
- `eff.projects` (EffectiveRole.projects Map) referenced from Task 4/5/7/9/10 — used in Task 14's guest-invite test claim.
- `canSee(db, userId, ticketId)` signature (Tasks 7–11) — referenced via case 6.39/6.40 claims appended here.
- `listVisibleTickets` function exists (case 6.40 claim, Task 10/11 territory).
- Migration file naming convention `<ts>_proj-invites.cjs` — confirm `.cjs` migration format matches existing migrations dir convention.

---

## Open Questions (owner review before/during execution) — verbatim, 11 items

1. **Auth library: better-auth** (justified above). Pin the latest 1.x at execution; the exact version lands in the lockfile and PR description. Owner sign-off requested on the library choice itself.
2. **`visibleEventsFor` return type vs the contract.** The contract types it `AsyncIterable<EventEnvelope>` but also requires revocation to yield `{kind:'purge', entityId}` — those cannot both hold. This plan implements `AsyncIterable<SyncItem>` with `SyncItem = LedgerEvent | PurgeInstruction`. Flagged, not silently resolved; Plan 10's consumption should confirm the union.
3. **Two ways onto a project.** `membership.granted {scope:{projectId}}` and `project.member_added` overlap. This plan's modeling: `membership.granted` carries *roles* (and is how guests attach to a project); `project.member_added` is the roster path for existing workspace members (with the projectAdmin flag). Both land in `proj_memberships`. Confirm or collapse.
4. **Non-ticket events in sync-down.** Chosen: workspace/project/membership events go to non-guest members; workflow and ticket-type definitions go to everyone including guests (they cannot render a shared ticket's status without its workflow). Confirm the guest slice.
5. **Visibility bypass — SETTLED, and amended by the owner (2026-08-27): the owner reads everything; admins do not.** The plan proposed no bypass for anyone; the owner drew the line one role higher. The workspace **owner** bypasses read visibility across their workspace — the workspace is the container everything else sits inside, and its owner owns the container. Because reads leave no event trace, the power cannot be made honest by attribution, so it is made honest by **disclosure**: the visibility controls state plainly that the workspace owner can always see (Plan 6 carries the copy — `Visible to: these people — and the workspace owner, always`). **Admins** get exactly what the plan proposed: they manage but do not silently see, and must join a project (an attributed event) to read its project-mode tickets or create in it. Writing is unchanged for everyone, owner included. Implemented in `canSeeResolved` (Task 7); the sync-down filter and every read route inherit it for free, because they all defer to the one function.
6. **Purge existence-leak on membership loss.** After `membership.revoked`/`project.member_removed`, purges are emitted for every now-invisible ticket in the lost scope — including ids the client may never have held (server-side per-client held-sets do not exist in this plan; Plan 10 owns sync state and could narrow this). A purge of an unheld id is a client no-op, but the id itself travels. Accepted here; Plan 10 may tighten.
7. **Read endpoints live in this plan.** Plan 3 ships projections, not HTTP routes, so the minimal list/read/history endpoints are built here. If another plan also claims ticket read routes, merge at execution — the visibility enforcement in them is this plan's, regardless of file ownership.
8. **Vendor tables are not snake_case.** better-auth's generated tables keep the library's naming — a deliberate exception to CODING_STANDARDS, called out in the migration header.
9. **Explicit lists are exactly the authored list — SETTLED (owner decision 2026-08-27): the sharp edge stays, and the client warns at the moment of authoring.** Creator/assignee are not implicitly appended; a creator can lock themselves out of their own ticket. Auto-appending the creator would be the system inventing a claim nobody made, so the server keeps the list exactly as authored. What the owner added: the *client* warns, at the moment a `visibility.set` would exclude its own author, that they will lose access — naming the repair path (a project admin, or the workspace owner, who always sees). Warning is not inventing: the claim submitted is still exactly the authored list. The warning is client copy and lands in Plan 6's visibility editor alongside the owner-disclosure line from question 5; nothing in this plan's server behaviour changes.
10. **Invites — SETTLED (owner decision 2026-08-27); the founding *screen* is the one client surface still unowned.** This question originally reported that nobody owned invite issuance or acceptance, and it was wrong twice over: the vocabulary could not express an invite at all (`membership.granted` names a `userId`, which a person who has never signed in does not have), and Plan 6 in fact already owned the client half — its Task 15 builds `/invite/[token]` and an `InviteGateway`, and pins the two server routes it calls. Task 14 now supplies the vocabulary (`invite.sent` naming an *address*, `invite.accepted`, `invite.revoked`) and those two routes, plus issuance. Still genuinely unowned, and only this: the screen that founds a workspace — a form calling `POST /v1/workspaces` and routing into the result. Assign when Plan 6 is walked; everything else in this question's original list now has an owner.
11. **Route prefix — SETTLED (owner decision 2026-08-27).** Task 8's ticket read routes were `/api/workspaces/...`, predating coordination amendment 20; they are now `/v1/workspaces/...` like everything else, with the plan's own end-to-end tests moved with them. `/api/auth/*` stays as better-auth's vendor surface, which amendment 20 names as the one exception.

    Moving them turned up a second, larger error in the same tests. This plan's end-to-end cases posted events to `POST /api/workspaces/:workspaceId/events` — a route that **does not exist in any plan**, and that was recorded here as an assumption ("adapt its URL"). Plan 1 Task 11 registers `POST /v1/events`, with body `{ events: [envelope, …] }` and the workspace carried inside each envelope rather than in the path. So the tests were wrong about the URL *and* about the request shape, and would have 404'd rather than proving anything. Both are corrected against Plan 1's actual route rather than against a fresh assumption.

### planTextClaimsToVerify (Open Questions section)
- Plan 1 Task 11 registers `POST /v1/events` with body `{ events: [envelope, …] }`, workspace carried inside each envelope.
- Task 7 implements `canSeeResolved` and the owner-bypass logic.
- Plan 6's Task 15 builds `/invite/[token]` page and `InviteGateway`.
- Plan 10 owns sync state / consumes `visibleEventsFor`'s `AsyncIterable<SyncItem>` union (`SyncItem = LedgerEvent | PurgeInstruction`).
- Coordination doc's §8 lists projection registration order; amendment 20 establishes `/v1/*` prefix with `/api/auth/*` exception.
- CODING_STANDARDS calls for snake_case tables generally; better-auth vendor tables are a deliberate documented exception.

---

## Cross-task contradictions / flags noticed within this range

1. **`workspaceNameFromLedger` authorship ambiguity.** Task 13's Step 4b code comment says this helper is "Task 14's helper — latest workspace.created/renamed," but Task 13 code calls it directly in `routes/workspaces.ts`, and Task 14's own route description (`GET /v1/invites/:token`) also says `workspaceName` comes from `workspaceNameFromLedger(db, workspaceId)` "the latest `workspace.created`/`workspace.renamed` name in the events table." Neither task's Files section lists a file that would contain this helper's definition (not in Task 13's Files, not in Task 14's Files). The helper is referenced by both tasks as if pre-existing but is not created by either — an orphaned dependency the adaptation map must resolve (likely belongs in a shared `workspaces/` or `ledger/` helper module).

2. **Features.md bullet for Task 13 references a file not in Task 13's own Files list.** The Step 5 Features.md bullet cites `apps/server/src/workspaces/bootstrap-workspace.ts`, which Task 13's Files section never lists (it creates only `routes/workspaces.ts`). This file is Task 5's (bootstrapWorkspace), so the Features.md bullet spans two tasks' output — not a contradiction in code, but a documentation/attribution note for the adaptation map.

3. **Test cases 6.39–6.40 appended under Task 14's Step 5 but describe Task 7 behavior** (owner bypass, `canSee`, `listVisibleTickets`), not invites. The plan text places them in the same fenced block as 6.32–6.38 and 6.41–6.42, without a task boundary marker — worth flagging so the adaptation map doesn't misattribute test ownership to Task 14's own test files (`test/routes/invites.test.ts` etc.) when 6.39/6.40 actually cite `test/visibility/can-see.test.ts` and `test/visibility/visible-tickets.test.ts`.

4. **`GET /v1/invites/:token` 404 body exactness not specified.** The plan states repeatedly that unknown/revoked/accepted/spent tokens are "indistinguishable... one 404 body" but never gives the literal JSON shape of that body anywhere in this range (unlike the 400 body for Task 13, which is given verbatim). Implementers need to choose or find the body defined elsewhere (possibly Task 12's generic-refusal pattern) — flagged as an underspecified interface, not a contradiction, but load-bearing for test-writing.

5. **`proj_invites.apply()` method bodies are comments, not code**, unlike Task 13's route which is fully written out. This is a spec-completeness gap specific to Task 14 relative to Task 13's higher precision — flag for extra scrutiny during implementation since the plan's own "no TBDs" self-review claim (line ~5300, Self-review point 2) is arguably not fully met by the `/* INSERT ... ON CONFLICT DO NOTHING */`-style comments in `proj-invites.ts`.
