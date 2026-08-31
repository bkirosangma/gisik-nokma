# Extract D — Plan 4 (auth-visibility), Tasks 10–12

Source: `docs/superpowers/plans/2026-08-20-04-auth-visibility.md` lines 3955–4923.

---

## Task 10: Rollup honesty — true totals with the restriction named

**Files:**
- Create: `apps/server/src/visibility/rollup.ts`
- Modify: `apps/server/src/routes/tickets.ts` (single-ticket response gains `rollup`)
- Test: `apps/server/test/visibility/rollup.test.ts`
- Modify (implied by Step 5's test addition): `apps/server/test/routes/tickets-read.test.ts`

**Interfaces consumed:**
- `proj_rollups` (Plan 3) — "true DIRECT-children counts by category over ALL children, computed with no visibility filtering; columns per Cross-plan path assumptions". Columns used: `ticket_id`, `open_count`, `active_count`, `terminal_count`.
- `proj_visibility` children index (Task 6) — columns used: `project_id`, `workspace_id`, `resolved_mode`, `resolved_user_ids`, keyed by `parent_id`.
- `canSeeResolved` / `getResolvedVisibility` (Tasks 6–7)
- `resolveEffectiveRole` (Task 4)

**Interfaces produced:**
```ts
export interface RollupView {
  total: number;
  open: number;
  active: number;
  terminal: number;
  /** Direct children THIS viewer cannot see. Per-viewer — computed at read, never stored. */
  restrictedCount: number;
}

export async function rollupFor(db: Queryable, viewerId: string, ticketId: string): Promise<RollupView | null>
```
- Single-ticket read response shape changes to: `{ ticket, parent, rollup: RollupView | null }` (was `{ ticket, parent }`).

**Consumed from other plans (raw import/usage as spelled in plan text):**
- `proj_rollups` table — Plan 3 (no explicit import path given; consumed via raw SQL `SELECT open_count, active_count, terminal_count FROM proj_rollups WHERE ticket_id = $1`)
- `resolveEffectiveRole` from `../permissions/effective-role` (this plan's own Task 4)
- `canSeeResolved` from `./can-see` (this plan's own Task 7)
- `Queryable` from `../db/queryable`

**Refusals:** None in Task 10 — no `rule`/`reason` refusal strings appear in this task.

**Test count:** 6 total.
- `rollup.test.ts`: 4 tests (`describe('rollupFor — planted defect: "5 of 8 done · 2 restricted"')`: "carries true totals over ALL children plus the count the viewer cannot see"; "a fully visible family reports restrictedCount 0 — the field is always present, never implied"; "a ticket with no rollup row reports null — nothing is invented"; "restrictedCount is per-viewer: the listed user sees 0 restricted on the same parent")
- `tickets-read.test.ts` addition: 1 test ("the single read carries the rollup with true totals and the viewer's restrictedCount") — plan text states this brings that file to "7 tests" total.
- Step 6 also runs full server suite for regression check (no new count given).

**planTextClaimsToVerify:**
- `proj_rollups` table exists (from Plan 3) with columns `ticket_id`, `open_count`, `active_count`, `terminal_count`, and a unique/PK constraint on `ticket_id` supporting `ON CONFLICT (ticket_id) DO UPDATE` in the test seed helper.
- `proj_visibility` table has columns `parent_id`, `project_id`, `workspace_id`, `resolved_mode`, `resolved_user_ids`, `ticket_id`.
- `resolveEffectiveRole` is exported from `apps/server/src/permissions/effective-role` (Task 4) with a signature usable as `resolveEffectiveRole(db, viewerId, workspaceId)`.
- `canSeeResolved` is exported from `apps/server/src/visibility/can-see` (Task 7), callable as `canSeeResolved(eff, viewerId, { workspaceId, projectId, resolvedMode, resolvedUserIds })`.
- `Queryable` type exists at `apps/server/src/db/queryable`.
- `apps/server/src/routes/tickets.ts` contains a `GET /v1/workspaces/:workspaceId/tickets/:ticketId` handler currently returning `{ ticket, parent }` (single statement `return { ticket, parent };`), with access to `deps.pool` and `request.currentUserId`.
- Test helpers exist: `migrateTestDb`, `testPool`, `truncateAll` (from `../helpers/db`); `applyAll`, `seedMember`, `seedTicket`, `setVisibilityEnv` (from `../helpers/seed`).
- `apps/server/test/routes/tickets-read.test.ts` exists already, with a `sessionFor` helper and an `app` fixture usable via `app.inject(...)`, and currently has some existing test count that becomes 7 after this addition.

---

## Task 11: visibleEventsFor — the sync-down visibility filter (Plan 10's interface)

**Files:**
- Create: `apps/server/src/visibility/visible-events-for.ts`
- Test: `apps/server/test/visibility/visible-events-for.test.ts`

**Interfaces consumed:**
- `events` ledger table with `workspace_seq` cursor column, and `LedgerEvent` type (Plan 1) — imported in test as `import type { LedgerEvent } from '../../src/ledger/event-store';`
- `canSee` / `canSeeResolved` / `getResolvedVisibility` (Task 7) — implementation imports `canSee` from `./can-see`
- `resolveEffectiveRole` (Task 4) — imported from `../permissions/effective-role`
- `proj_visibility` (Task 6)
- `membershipId` and `EventEnvelope` — imported in test as `import { membershipId, type EventEnvelope } from '@gisik-nokma/domain';`; implementation imports `import type { EventEnvelope } from '@gisik-nokma/domain';`

**Interfaces produced (THE interface Plan 10 consumes — plan text: "do not rename anything here"):**
```ts
export interface PurgeInstruction {
  kind: 'purge';
  entityId: string;
}

/** Added during implementation, beyond the interface section's own listing: */
export interface ScopeRevokedInstruction {
  kind: 'scope-revoked';
  workspaceId: string;
  projectId?: string;
}

export type SyncItem = LedgerEvent | PurgeInstruction | ScopeRevokedInstruction;

export async function* visibleEventsFor(
  db: Queryable,
  userId: string,
  workspaceId: string,
  afterSeq: number,
): AsyncGenerator<SyncItem>
```

Note: the "Interfaces" bullet list above the Step 1 code block states only `SyncItem = LedgerEvent | PurgeInstruction` (two-member union) and describes `visibleEventsFor(...): AsyncIterable<SyncItem>`; the actual Step 3 implementation additionally defines `ScopeRevokedInstruction` and folds it into `SyncItem` (three-member union), and types the generator's return as `AsyncGenerator<SyncItem>` rather than `AsyncIterable<SyncItem>`. **This is a within-task discrepancy — see Contradictions below.**

- `afterSeq` is documented as "the WORKSPACE cursor (`workspace_seq`), not a per-entity `seq`." Per coordination §18, per-entity `seq` cannot order a workspace stream since every entity restarts at 1.
- Consumer discriminates purge items with `'kind' in item && item.kind === 'purge'` (envelopes have no top-level `kind`; `entity.kind` is nested).
- The contract bullet notes: "The contract types the return as `AsyncIterable<EventEnvelope>`, but purge instructions force the union — flagged under Open questions, not silently resolved."

**Filter semantics (exact clauses, each a test):**
1. Events streamed in `workspace_seq` order for `workspace_seq > afterSeq`, filtered against visibility AS OF NOW (current projections). Backfilling pre-`afterSeq` history on newly granted visibility is Plan 10's job.
2. Ticket events: yielded iff `canSee(userId, ticketId)` now. Events about invisible tickets are NEVER yielded — not even their existence.
3. Purge on revocation: a `visibility.set` or `ticket.reparented` event in range that leaves the target — or any inheriting descendant — invisible yields `{kind:'purge', entityId: <ticketId>}` per ticket, deduplicated per call. Traversal prunes at authored descendants.
4. Purge on membership loss: `membership.revoked` or `project.member_removed` naming this user yields purges for every ticket in the lost scope now invisible to the user.
5. Non-ticket events: workspace/project/membership events → non-guest members only. `workflow`/`ticket-type` definition events → everyone including guests (a guest needs the workflow definition to render their explicitly-shared ticket's status). Both choices flagged under Open questions.

**Refusals:** None (rule/reason refusal strings) — this task governs sync-down filtering, not permission refusals.

**Test count:** 9 (Step 4: "PASS (9 tests)"). Enumerated `it(...)` blocks in the Step 1 code:
1. "planted defect: events about invisible tickets are never yielded — not even their existence"
2. "revocation by visibility.set yields a purge tombstone instead of the event"
3. "an ancestor revocation purges inheriting descendants too — pruning at authored ones"
4. "losing project membership purges that project's now-invisible tickets"
5. "definition events reach guests; membership events do not"
6. "a non-member of the workspace receives nothing at all"
7. "respects afterSeq as the WORKSPACE cursor: only events beyond it are yielded, and each carries its own cursor"
8. "planted defect: a ticket born after the cursor is never skipped — the cursor counts the workspace, not the entity"
9. "planted defect: a yielded event carries ISO instants, not stringified Dates — and a +05:30 claim arrives as the equivalent Z"

**planTextClaimsToVerify:**
- `events` table has columns: `id`, `workspace_id`, `entity_kind`, `entity_id`, `type`, `version`, `payload`, `actor_id`, `origin`, `client_time`, `server_time`, `seq`, `workspace_seq` (all referenced in the `SELECT` in Step 3 and destructured in `envelopeFromRow`).
- `LedgerEvent` type is exported from `apps/server/src/ledger/event-store` and has fields: `id`, `workspaceId`, `entity: {kind, id}`, `type`, `version`, `payload`, `actorId`, `origin`, `clientTime`, `serverTime`, `seq`, `workspaceSeq`.
- `EventEnvelope` and `membershipId` are exported from `@gisik-nokma/domain`.
- `client_time` and `server_time` columns are `timestamptz` (per comment: "Both clocks are `timestamptz` (Plan 1 Task 6, owner decision 2026-08-20)"), so the pg driver returns `Date`, requiring `.toISOString()` conversion "the way Plan 1's `rowToEnvelope` does".
- `resolveEffectiveRole(db, userId, workspaceId)` returns an object with `workspaceRole: string | null`, and `'guest'` is one possible value.
- `canSee(db, userId, ticketId)` exists in `apps/server/src/visibility/can-see` with that exact call signature (positional `db, userId, ticketId`) — note Task 10 uses `canSeeResolved(eff, viewerId, {...})` with a different signature shape; Task 11 uses plain `canSee(db, userId, ticketId)`.
- `proj_visibility` has columns `ticket_id`, `own_mode`, `parent_id` (used in `nowInvisibleInheritSubtree`, filtering `own_mode === 'inherit'`), and `ticket_id`, `workspace_id`, `project_id` (used in `nowInvisibleTicketsInScope`).
- `proj_tickets` has columns `ticket_id`, `workflow_id`, `type_id` (used in `definitionsFor` and `definitionIsUsedByVisibleTicket`).
- Membership events (`membership.granted`, `membership.revoked`) carry `payload: { userId, role? }` — with the comment "membership is workspace-scoped now and its payload carries no scope at all" (contrasted against "the old `MembershipScope`", implying a prior/other design existed elsewhere).
- `project.member_removed` payload is `{ userId }`.
- Envelope `entity.kind` values used: `'ticket'`, `'membership'`, `'project'`, `'workspace'`, `'workflow'`, `'ticket-type'`.
- Test helpers referenced: `migrateTestDb`, `testPool`, `truncateAll` (`../helpers/db`); `testEnvelope` (`../helpers/envelope`); `appendTestEvent` (`../helpers/ledger`); `applyAll`, `seedGuest`, `seedMember`, `seedTicket`, `setVisibilityEnv` (`../helpers/seed`); `ulid` from `ulidx`.
- `LedgerEvent.seq` and `LedgerEvent.workspaceSeq` are distinct numeric fields, with `seq` restarting at 1 per entity and `workspaceSeq` monotonic across the workspace (asserted directly in test 8: `newborn.seq < older.seq` while `newborn.workspaceSeq > older.workspaceSeq`).
- `Queryable` type import path `../db/queryable` (implied, not directly shown as an import line in the Step 3 excerpt but used as parameter type `db: Queryable`).

---

## Task 12: Route-level security proofs, session hygiene, and the sync ledgers

**Files:**
- Create: `apps/server/test/routes/security.test.ts`
- Modify: `Features.md` (new server-core §6 bullets)
- Create: `test-cases/06-auth-visibility.md`

**Interfaces consumed:**
- "everything this plan built" (Tasks 1–11 of this plan)
- Plan 1's ingest HTTP route `POST /v1/events`, body `{ events: [envelope, …] }` — "the workspace travels inside each envelope, not in the path (verified against Plan 1 Task 11, not assumed)"

**Interfaces produced:**
- End-to-end proof (test file) that permission/visibility layers hold at the HTTP surface.
- `Features.md` §6 and `test-cases/06-auth-visibility.md` entries.
- Explicit scope note: "`POST /v1/workspaces` is the one route not proven here — it arrives in Task 13 with its own file, including its no-session 401."

**Consumed from other plans (raw import/usage as spelled):**
- `buildApp` from `../../src/app` — comment: "Plan 1's app builder — adapt name/signature, keep the assertions"
- `LogOtpSender` from `../../src/auth/otp-sender`
- `migrateTestDb`, `testPool`, `truncateAll` from `../helpers/db`
- `signInWithPhone` from `../helpers/session`
- `seedGuest`, `seedMember`, `seedTicket` from `../helpers/seed`
- `testEnvelope` from `../helpers/envelope`
- `pnpm --filter ./apps/server run verify-projections` — comment: "adapt to Plan 1's script name"

**Refusal strings (verbatim, exact-rejection tests — reproduce character-for-character):**

Test: "planted defect: a guest ingesting an event on an invisible ticket is refused with the standard shape"
```ts
expect(res.json()).toMatchObject({
  refused: true,
  rule: 'permission.visibility',
  reason: 'This ticket is not visible to you.',
});
```
Plan text comment: "Status code follows Plan 1's refusal convention (its ingest tests document it); the body above is this plan's contract."

Test: "planted defect: a member reading another project's ticket via direct id is refused as 404"
```ts
expect(res.statusCode).toBe(404);
expect(res.json()).toEqual({ error: 'not_found' });
```

Test: "an unauthenticated ingest is a 401 before any permission logic runs"
```ts
expect(res.statusCode).toBe(401);
```
(no body-shape assertion given)

**Other exact assertions (session hygiene, not refusal-rule strings but character-exact test expectations):**

Test: "sign-out invalidates the session token (fixation/expiry basics per the auth library)"
```ts
expect(after.json()?.user ?? null).toBeNull(); // the old token opens nothing
```

Test: "a pre-set cookie value never becomes the session (no fixation): sign-in issues a fresh token"
```ts
expect(setCookie).not.toContain('attacker-chosen-value');
expect(setCookie).toMatch(/HttpOnly/i);
```
Cookie header set in request: `cookie: 'better-auth.session_token=attacker-chosen-value'`

**Test count:** 5 (Step 2: "PASS (5 tests)"):
1. "planted defect: a guest ingesting an event on an invisible ticket is refused with the standard shape"
2. "planted defect: a member reading another project's ticket via direct id is refused as 404"
3. "an unauthenticated ingest is a 401 before any permission logic runs"
4. "sign-out invalidates the session token (fixation/expiry basics per the auth library)"
5. "a pre-set cookie value never becomes the session (no fixation): sign-in issues a fresh token"

**Features.md additions (verbatim block to append, §6):**
```markdown
## 6. Server core — auth, membership & visibility

- ⚙️ **Identity & sessions** — better-auth on Fastify: phone OTP, email magic link, Google OAuth, passkeys; no passwords. httpOnly-cookie sessions for web, bearer tokens for the apps. OTP delivery behind `OtpSender` (dev/log implementation; the DLT-registered SMS provider is a deployment concern). Identity is infrastructure, not events. `apps/server/src/auth/`
- ⚙️ **Membership events & effective roles** — `workspace.created`, `project.created`, `membership.granted`/`membership.revoked`, `project.member_added`/`project.member_removed` in the ledger; `proj_memberships` resolves each user's workspace role and per-project admin flags; founding a workspace appends the default simple-Kanban workflow, the four built-in ticket types bound to it, and the founder's owner grant — in that order, on accept and never on a duplicate re-submission. `apps/server/src/projections/proj-memberships.ts`, `apps/server/src/workspaces/bootstrap-workspace.ts`
- ⚙️ **Project existence** — `proj_projects` makes `project.created` answerable, and every event that names a project is checked against it before any membership question is asked, so a ticket can never be created into a project nobody founded and nobody is ever refused for the wrong reason. Scoped by workspace: a project id from another workspace is not found. `apps/server/src/projections/proj-projects.ts`, `apps/server/src/permissions/check-permission.ts`
- ✅ **Permission refusals** — a pre-engine ingest gate refuses identity spoofing, borrowed server origin, and role shortfalls with the standard `{refused, rule, reason}` shape (`permission.role`, `permission.visibility`), reasons in plain language, every refusal proven against a planted defect. `apps/server/src/permissions/`
- ✅ **Ticket visibility** — `visibility.set` claims a mode (workspace / project / explicit / inherit); `proj_visibility` resolves every ticket's audience by walking inherit chains to the nearest authored ancestor (roots default to project) and re-resolves on reparent and ancestor changes; `canSee` backs 404-enforced reads and one-pass filtered lists; guests see only explicit shares; the owner reads the whole workspace (a disclosed power, never a hidden one); admins get no bypass and join projects on the record like anyone else. `apps/server/src/visibility/`
- ✅ **Honesty under restriction** — rollup responses carry true totals over all children plus the viewer's `restrictedCount`; a visible child under a restricted parent gets `{kind: 'restricted'}` — existence, no title; ledger history goes out with provenance untouched for anyone entitled to see. `apps/server/src/visibility/rollup.ts`, `apps/server/src/routes/tickets.ts`
- ⚙️ **Visibility-scoped sync feed** — `visibleEventsFor(userId, workspaceId, afterSeq)` walks the workspace stream in `workspace_seq` order (the per-workspace cursor, coordination §18 — never per-entity `seq`, which would skip newborn entities on resume), yields only visible-ticket events, each carrying its cursor and both clocks as absolute ISO 8601 `Z` instants, plus `{kind:'purge'}` tombstones for whatever revocation takes away; the interface the sync plan consumes. `apps/server/src/visibility/visible-events-for.ts`
```

**test-cases/06-auth-visibility.md additions (verbatim block, cases 6.1–6.22, plus header):**
```markdown
# 6. Server core — auth, membership & visibility

Mirrors Features.md §6. Status: ❌ not covered · ✅ covered · 🟡 partial · 🧪 manual · 🚫 out of scope.

- **6.1** ✅ Phone OTP sign-in end-to-end: code delivered via OtpSender, verify opens an httpOnly-cookie session. (`test/auth/sign-in-flows.test.ts`)
- **6.2** ✅ Email magic link sign-in: link delivered via MagicLinkSender, following it opens a session. (`test/auth/sign-in-flows.test.ts`)
- **6.3** ✅ Bearer-token sessions authenticate the apps via the Authorization header. (`test/auth/sign-in-flows.test.ts`)
- **6.4** ✅ Unauthenticated and forged-token requests get a generic 401. (`test/auth/require-session.test.ts`)
- **6.5** ✅ proj_memberships resolves effective roles: grants, re-grants, revocations, project rosters; a project-scope guest is a guest of the workspace; deterministic rebuild. (`test/projections/proj-memberships.test.ts`, `test/permissions/effective-role.test.ts`)
- **6.6** ✅ Admin-only event types (workflow.defined, ticket-type.defined, project.created) are refused to plain members with rule permission.role. (`test/permissions/check-role-permission.test.ts`)
- **6.7** ✅ A claim submitted as another person (actorId ≠ session user) is refused. (`test/permissions/check-role-permission.test.ts`)
- **6.8** ✅ A client-submitted event wearing origin 'server' is refused; founding a workspace appends the whole founding sequence server-side. (`test/permissions/check-role-permission.test.ts`)
- **6.9** ✅ Visibility resolution: authored modes win, inherit chains walk to the nearest authored ancestor, roots default to project mode. (`test/projections/proj-visibility.test.ts`)
- **6.10** ✅ Re-resolution on reparent and on ancestor visibility change, pruning at authored descendants; deterministic rebuild. (`test/projections/proj-visibility.test.ts`)
- **6.11** ✅ A guest acting on a ticket not explicitly shared with them is refused with rule permission.visibility (pipeline and HTTP). (`test/permissions/check-visibility-permission.test.ts`, `test/routes/security.test.ts`)
- **6.12** ✅ A member reading or acting on another project's ticket via direct id is refused — reads as an indistinguishable 404, ingest as permission.visibility. (`test/routes/security.test.ts`, `test/permissions/check-visibility-permission.test.ts`)
- **6.13** ✅ Rollups carry true totals over ALL children plus per-viewer restrictedCount — the "5 of 8 done · 2 restricted" planted defect. (`test/visibility/rollup.test.ts`)
- **6.14** ✅ A visible child under a restricted parent returns parent {kind:'restricted', id} — existence, no title. (`test/routes/tickets-read.test.ts`)
- **6.15** ✅ Provenance is never redacted: ticket history returns actor and both times untouched even when the actor shares no project with the viewer — both clocks arriving as absolute ISO 8601 `Z` instants, which is what "untouched" means for a `timestamptz` column. (`test/routes/tickets-read.test.ts`)
- **6.16** ✅ visibleEventsFor never yields events about invisible tickets — the id itself does not appear in any yielded item. (`test/visibility/visible-events-for.test.ts`)
- **6.17** ✅ Revocation yields purge tombstones: direct visibility.set, inheriting descendants (pruned at authored nodes), and membership loss. (`test/visibility/visible-events-for.test.ts`)
- **6.18** ✅ Session hygiene: sign-out invalidates the token; a pre-set cookie never becomes the session; session cookies are HttpOnly. (`test/routes/security.test.ts`)
- **6.19** ✅ visibility.set demands project-admin rights or ticket creatorship, and must name the ticket it is attached to. (`test/permissions/check-visibility-permission.test.ts`)
- **6.20** 🚫 Real SMS delivery through the DLT-registered provider — deployment concern, tracked as an operational errand, not a test. (this plan, Open questions)
- **6.21** ✅ visibleEventsFor resumes by the WORKSPACE cursor: only events past `workspace_seq > afterSeq` are yielded, each carries its `workspaceSeq`, and the planted defect proves a ticket born after the cursor is not skipped (per-entity `seq` would bury its first event). (`test/visibility/visible-events-for.test.ts`)
- **6.22** ✅ Planted defect: a yielded envelope's clocks are ISO 8601 `Z` instants, not stringified `Date`s — a claim submitted at `+05:30` arrives as the equivalent `…Z`, still parseable by any runtime, with the client/server skew intact. (`test/visibility/visible-events-for.test.ts`)
```
Note: header text explicitly numbers "6.1–6.20" in the Step 5 prose, but the actual list runs through 6.22 (22 entries, not 20) — see Contradictions.

**planTextClaimsToVerify:**
- `apps/server/src/app` exports `buildApp` accepting `{ pool, otpSender }` and returning `{ app }` (a `FastifyInstance`).
- `apps/server/src/auth/otp-sender` exports `LogOtpSender`, constructible as `new LogOtpSender(() => {})`, with a `.sent` array of objects containing at least `.code`.
- Routes exist: `GET /api/auth/get-session`, `POST /api/auth/sign-out`, `POST /api/auth/phone-number/send-otp`, `POST /api/auth/phone-number/verify`, `POST /v1/events`, `GET /v1/workspaces/:workspaceId/tickets/:ticketId`.
- `POST /v1/events` accepts body `{ events: [envelope, …] }` with the workspace inside each envelope, not in the URL path — plan text states this "verified against Plan 1 Task 11, not assumed" (i.e., this claim is asserted as already-verified elsewhere, not newly checked here).
- The ingest route's refusal response for `permission.visibility` has shape `{ refused: true, rule: 'permission.visibility', reason: 'This ticket is not visible to you.' }` (per `toMatchObject`).
- The 404 response body for a not-found ticket is exactly `{ error: 'not_found' }`.
- `app.inject` supports `headers: { cookie: 'better-auth.session_token=...' }` to simulate a pre-set session cookie, and the sign-in response's `set-cookie` header is inspectable via `String(verify.headers['set-cookie'])`.
- Session cookie name is `better-auth.session_token`.
- Cookie is set with `HttpOnly` flag (regex `/HttpOnly/i` must match `set-cookie`).
- Step 3 references `pnpm --filter ./apps/server run verify-projections` as a script "adapt to Plan 1's script name" that "re-derives proj_memberships and proj_visibility from the ledger with zero diffs" — implies such a verifier script exists or will exist per Plan 1.
- `Features.md` §6 is "settled per the coordination doc §2" as this plan's section number.
- `test-cases/06-auth-visibility.md` is "this plan's own bucket, per the coordination doc §2"; plan text states "Plans 1–3 own buckets 03–05 — never renumber existing IDs."
- Test helpers: `signInWithPhone` (`../helpers/session`), `seedGuest`/`seedMember`/`seedTicket` (`../helpers/seed`), `testEnvelope` (`../helpers/envelope`), `migrateTestDb`/`testPool`/`truncateAll` (`../helpers/db`) — same helper set as prior tasks, now also including `signInWithPhone`.
- `test/routes/tickets-read.test.ts` is claimed (Task 10) to already cover "6.14" (restricted-parent `{kind:'restricted', id}`) and "6.15" (provenance untouched) — these are pre-existing tests from earlier tasks in the plan, not created in Task 10/11/12's own file lists; their existence on `main`/prior-task branches needs verification.
- `test/permissions/check-visibility-permission.test.ts` and `test/permissions/check-role-permission.test.ts` and `test/permissions/effective-role.test.ts` and `test/projections/proj-memberships.test.ts` and `test/projections/proj-visibility.test.ts` and `test/auth/sign-in-flows.test.ts` and `test/auth/require-session.test.ts` are all referenced as already existing (from earlier tasks in this plan, not Tasks 10–12) — verify each exists per its originating task.

---

## Contradictions within this range (D: T10–T12)

1. **Task 11 interface-summary vs implementation mismatch.** The "Interfaces" bullet list preceding Step 1 defines `SyncItem = LedgerEvent | PurgeInstruction` (two-member union) and describes the function's return type as `AsyncIterable<SyncItem>`. The Step 3 implementation instead defines a third union member, `ScopeRevokedInstruction { kind: 'scope-revoked'; workspaceId: string; projectId?: string }`, folds it into `SyncItem` (three-member union), and types `visibleEventsFor` as returning `AsyncGenerator<SyncItem>` rather than `AsyncIterable<SyncItem>`. The task's own text says of `SyncItem`/`PurgeInstruction` "do not rename anything here," but the actual shipped union is larger than what's declared "the" interface — an implementer must decide whether `ScopeRevokedInstruction` is part of the frozen contract or an unauthorized addition.

2. **Task 11 `canSee` call signature vs Task 10 `canSeeResolved` call signature differ in shape** (positional `db, userId, ticketId` vs `eff, viewerId, {workspaceId, projectId, resolvedMode, resolvedUserIds}`) — not strictly a contradiction (different functions) but worth flagging since both are described as coming from the same Task 6/7 visibility module family and an implementer could conflate them.

3. **Task 12 test-cases file: stated range vs actual content.** Step 5's prose says "Create `test-cases/06-auth-visibility.md` ... cases 6.1–6.20" but the verbatim block that follows contains 22 entries, ending at **6.22** (6.20 is the 🚫 out-of-scope SMS entry, followed by 6.21 and 6.22 for the workspace-cursor and ISO-instant planted defects from Task 11). The stated range undercounts the actual list by 2.

4. **Cross-task numbering note (not strictly a defect, but relevant to the adaptation map):** Task 10's `rollupFor` tests are asserted to exist in `rollup.test.ts` (4 tests) and one more added to `tickets-read.test.ts`, yet test-cases entry 6.14/6.15 in Task 12 cite `tickets-read.test.ts` for restricted-parent-kind and provenance behavior that were not created within T10–T12's own Step blocks — those must originate from an earlier task in this same plan (outside this extraction's range), so their existence is a claim to verify against that earlier task's extraction, not against T10–T12 itself.

No task in this range creates a file another task in this range also creates (rollup.ts / visible-events-for.ts / security.test.ts / Features.md / test-cases file are all distinct paths).
