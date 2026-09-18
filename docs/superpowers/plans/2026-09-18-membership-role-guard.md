# Membership Role Guard and Role Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for a workspace to lose its last owner or for an admin to promote themselves to owner, and only then expose the members roster's role control.

**Authority (there is no spec document — say so rather than inventing one):** the owner's ruling of 2026-09-18, answering the controller's decision list. Verbatim: *"regarding membership control. lets go with your recommendation. queue the tasks up."* The controller's recommendation, which the owner accepted, was **guard first, then the control**, and if the control ships, **`Owner` is omitted from it**, matching the judgement the invite form already made. This plan is therefore the design of record; where it needs a product decision it names the one already taken rather than making a new one.

> ### ⚠ READ THIS FIRST — the hole is LIVE, not latent
>
> `apps/server/src/routes/events.ts` is the **client-submitted** ingest door. Its body schema is
> `{ events: unknown[] }` with `minItems: 1` and **no per-type constraint**; it hands the batch to
> `ingestClientBatch`, which applies the permission gate and nothing else. For `membership.granted`
> that gate is `if (!isWorkspaceAdmin) return refuse(...)` — **so any workspace admin can already
> submit a role change today**, and the projection overwrites on conflict
> (`ON CONFLICT … DO UPDATE SET role = excluded.role`).
>
> The consequence: an admin can demote the sole owner and promote themselves **right now**, by
> posting two events. Nothing refuses it. This is why Task 1 ships first and alone.
>
> **It also means a claim in the shipped code is wrong.** `apps/web/app/w/[workspaceId]/members/page.tsx`'s
> docblock (`:42-52`) says the prototype's role `<select>` is omitted because *"the product has NO
> per-member role-change door at all: no route accepts one, and `role` is written only by membership
> creation."* Measured: a door exists (`POST /events`, unconstrained by type) and `role` is written by
> any `membership.granted`, not only at creation. The **conclusion** (do not draw a picker) was right
> for a reason that does not hold; Task 2 corrects the sentence rather than deleting it, and the
> correction is part of that task's diff.

**Architecture:** Two additive layers, in this order, because the first is a security fix that stands alone and the second is a control that would otherwise be a new way to reach the hole the first closes.
- **The guard** splits across two layers, and the split is not arbitrary: *"may this actor grant this role?"* is an **actor-authority** question and belongs in `apps/server/src/permissions/check-permission.ts`, which already answers the sibling question for the same event. *"Would this change leave the workspace with no owner?"* is a **world-state** question and belongs in the rule engine, whose whole job is refusing claims about the world.
- **The control** is one column of one screen: the roster's read-only role chip becomes the prototype's `<select>`, minus its `Owner` option.

**Tech Stack:** TypeScript monorepo — `packages/domain` (zod, the event schemas), `packages/rule-engine` (checks, refusals), `apps/server` (Fastify, Postgres, `check-permission.ts`, `engine-context.ts`), `packages/app-core` (views, online mappers), `packages/ui` (the shared `Select`), `apps/web` (Next.js), vitest, Node 22.

## Global Constraints

- **Every fact below was measured on `main` at `baf8c2e0`.** Where a line is cited, read that line before relying on it.
- `membership.granted` payload is `{ userId: ulidString, role: workspaceRoleSchema, scope?: refused }`, `.strict()` (`packages/domain/src/events/membership.ts:95-99`).
- `membership.revoked` payload is `{ userId: ulidString, scope?: refused }`, `.strict()` (`:101-104`).
- `MembershipState = { kind: 'membership'; id; workspaceId; userId; role: WorkspaceRole }` (`packages/domain/src/entity-state.ts:66-72`), keyed by `membershipId(workspaceId, userId) = \`${workspaceId}:${userId}\`` (`:83-85`).
- `EngineContext.getEntityState('membership', id)` **already serves that state** over `proj_memberships` (ruling P18, `apps/server/src/engine-context.ts`). Read it; do not add a second membership reader.
- The projection upserts on conflict — `ON CONFLICT (workspace_id, user_id, scope_kind, project_id) DO UPDATE SET role = excluded.role` (`apps/server/src/projections/proj-memberships.ts`). A role change therefore overwrites; nothing is append-only at the row level.
- `membership.granted` and `membership.revoked` are admin-gated and nothing more: `if (!isWorkspaceAdmin) return refuse(WORKSPACE_MEMBERSHIP_REASON)` (`apps/server/src/permissions/check-permission.ts:548-552`). **No role-specific restriction exists.**
- The invite path already refuses to offer `owner` and `check-permission.ts:373` records it. The invite select ships `Admin / Member / Guest` only.
- **Case ids:** this plan owns the block **`13.820`–`13.849`** (measured free at `baf8c2e0`: the whole 13.8xx band above `13.819` is unused). Recount at your own tip **by case MARKER only** before minting — never by substring. Two other blocks are live: `13.700`–`13.759` and `13.760`–`13.819`.
- Six checks raw 0 at the frozen head; the controller runs the forced gate, never the executor. `Features.md` and `test-cases/13` change in the same commit as the code. `task-ledger.tsv` is untouched by executors.

---

### Task 1: The last-owner guard, in both layers

**Files:**
- Create: `packages/rule-engine/src/checks/membership.ts`
- Modify: `packages/rule-engine/src/refusal-rules.ts` (two ids, beside `closeRequiresTerminal` at `:25`)
- Modify: `packages/rule-engine/src/evaluate.ts` (dispatch the two membership arms)
- Modify: `packages/rule-engine/src/engine.ts` (`EngineContext` gains one method)
- Modify: `apps/server/src/engine-context.ts` (implement it over `proj_memberships`)
- Modify: `apps/server/src/permissions/check-permission.ts:548-552` (the actor-authority half)
- Test: `packages/rule-engine/test/membership.test.ts` (new), `apps/server/test/permissions/check-permission.test.ts`

**Interfaces:**
- Produces: `REFUSAL_RULES.lastOwner = 'last-owner'`; `REFUSAL_RULES.grantOwnerRequiresOwner = 'grant-owner-requires-owner'`; `checkMembershipGranted(env, ctx): Promise<Accept | Refusal>`; `checkMembershipRevoked(env, ctx): Promise<Accept | Refusal>`; and on `EngineContext`:
  `countWorkspaceOwners(scope: TenantScope, excludingUserId?: string): Promise<number>`
- Consumes: `membershipGrantedPayload`, `membershipRevokedPayload`, `membershipId`, `MembershipState` (all `@gisik-nokma/domain`); `refuse`/`ACCEPT` from `./refusals.js`; `malformedPayloadDetail` from `../refusal-rules.js`.

- [ ] **Step 1: Write the failing engine tests** — `packages/rule-engine/test/membership.test.ts`, modelled on `close.test.ts`'s harness (the `ctx` builder with `getEntityState` and the envelope helper). The `ctx` stub gains `countWorkspaceOwners`.

```ts
describe('13.820 a membership.granted that would leave zero owners is refused', () => {
  it('demoting the only owner is refused with last-owner', async () => {
    const r = await checkMembershipGranted(
      envelope('membership.granted', { userId: 'u1', role: 'member' }),
      ctxWith({ owners: 1, target: { userId: 'u1', role: 'owner' } }),
    );
    expect(r).toEqual({
      refused: true,
      rule: 'last-owner',
      reason: 'This change would leave the workspace with no owner. Grant the owner role to somebody else first.',
    });
  });

  it('demoting one of TWO owners is accepted', async () => {
    const r = await checkMembershipGranted(
      envelope('membership.granted', { userId: 'u1', role: 'member' }),
      ctxWith({ owners: 2, target: { userId: 'u1', role: 'owner' } }),
    );
    expect(r).toEqual({ refused: false });
  });

  it('a grant that does not touch an owner is accepted even with one owner', async () => {
    const r = await checkMembershipGranted(
      envelope('membership.granted', { userId: 'u2', role: 'admin' }),
      ctxWith({ owners: 1, target: { userId: 'u2', role: 'member' } }),
    );
    expect(r).toEqual({ refused: false });
  });

  it('13.821 membership.revoked of the only owner is refused with last-owner', async () => {
    const r = await checkMembershipRevoked(
      envelope('membership.revoked', { userId: 'u1' }),
      ctxWith({ owners: 1, target: { userId: 'u1', role: 'owner' } }),
    );
    expect(r).toEqual({ refused: true, rule: 'last-owner', reason: expect.stringContaining('no owner') });
  });

  it('a malformed payload is malformed-payload, not a domain refusal', async () => {
    const r = await checkMembershipGranted(
      envelope('membership.granted', { userId: 'u1', role: 'superuser' }),
      ctxWith({ owners: 2, target: { userId: 'u1', role: 'owner' } }),
    );
    expect(r).toMatchObject({ refused: true, rule: 'malformed-payload' });
  });

  it('an event whose type is not ours is ACCEPTed untouched', async () => {
    const r = await checkMembershipGranted(envelope('ticket.closed', {}), ctxWith({ owners: 1 }));
    expect(r).toEqual({ refused: false });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run test/membership.test.ts`
Expected: FAIL — `checkMembershipGranted is not a function`, and `REFUSAL_RULES.lastOwner` undefined.

- [ ] **Step 3: Add the two refusal ids**

In `packages/rule-engine/src/refusal-rules.ts`, beside `closeRequiresTerminal`:

```ts
  lastOwner: 'last-owner',
  grantOwnerRequiresOwner: 'grant-owner-requires-owner',
```

- [ ] **Step 4: Extend `EngineContext` and implement it on the server**

In `packages/rule-engine/src/engine.ts`, add to `EngineContext` — **scoped**, because the answer is a count over one workspace and a tenant scope is what makes it one:

```ts
  /**
   * How many members of this workspace hold the `owner` role, optionally
   * ignoring one user (the subject of the change under judgement — an owner
   * being demoted must not count themselves).
   *
   * A COUNT and not a list, deliberately: a check has no business reading
   * other members' rows, and a list would tempt one to.
   * OPTIONAL so every context that predates this still typechecks; a check
   * that needs it and cannot get it THROWS rather than refusing, matching the
   * contest evaluators' rule — a missing context is not the world's fault.
   */
  countWorkspaceOwners?(scope: TenantScope, excludingUserId?: string): Promise<number>;
```

In `apps/server/src/engine-context.ts`, implement it over the same table `readMembershipState` already reads:

```ts
async countWorkspaceOwners(scope, excludingUserId) {
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM proj_memberships
      WHERE workspace_id = $1 AND scope_kind = 'workspace' AND role = 'owner'
        AND ($2::text IS NULL OR user_id <> $2)`,
    [scope.workspaceId, excludingUserId ?? null],
  );
  return Number(rows[0]?.n ?? '0');
}
```

- [ ] **Step 5: Write the checks** — `packages/rule-engine/src/checks/membership.ts`, mirroring `close.ts` line for line (type guard, kind guard, `safeParse` with `malformedPayloadDetail`, then the domain rule)

```ts
export async function checkMembershipGranted(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'membership.granted') return ACCEPT;
  const parsed = membershipGrantedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This membership.granted event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const target = await ctx.getEntityState('membership', membershipId(env.workspaceId, parsed.data.userId));
  const wasOwner = target !== null && target.kind === 'membership' && target.role === 'owner';
  // Only a change that MOVES SOMEBODY OUT of owner can empty the workspace.
  if (wasOwner && parsed.data.role !== 'owner') {
    const others = await ownersOrThrow(ctx, env, parsed.data.userId);
    if (others === 0) {
      return refuse(REFUSAL_RULES.lastOwner,
        'This change would leave the workspace with no owner. Grant the owner role to somebody else first.');
    }
  }
  return ACCEPT;
}
```

`ownersOrThrow` is a small local helper in the same file that throws when `ctx.countWorkspaceOwners` is absent, with the sentence *"This context cannot count workspace owners, so the last-owner guard cannot run."* **Throwing rather than refusing is deliberate: a context that cannot answer must fail loudly, not read as a clean refusal against the actor.**

`checkMembershipRevoked` is the same shape with `membershipRevokedPayload` — a revocation of an owner is a move out of owner.

- [ ] **Step 6: Dispatch them** — `packages/rule-engine/src/evaluate.ts`, after the `ticket.reopened` arm:

```ts
    case 'membership.granted': return checkMembershipGranted(env, ctx);
    case 'membership.revoked': return checkMembershipRevoked(env, ctx);
```

- [ ] **Step 7: The actor-authority half** — `apps/server/src/permissions/check-permission.ts`, inside the existing `membership.granted` / `membership.revoked` branch at `:548-552`, keeping the current line and adding the narrower rule:

```ts
  if (env.type === 'membership.granted' || env.type === 'membership.revoked') {
    if (!isWorkspaceAdmin) {
      return refuse(WORKSPACE_MEMBERSHIP_REASON);
    }
    // Ruling (owner, 2026-09-18): only an OWNER may grant the owner role.
    // Without this an admin can demote the sole owner and then promote
    // themselves — an admin→owner escalation the wire has always permitted
    // and nothing has ever refused.
    //
    // There is NO `isWorkspaceOwner` in this file to reuse: the body computes
    // `const isWorkspaceAdmin = role === 'owner' || role === 'admin';` at
    // `:464` and nothing narrower. Write the comparison inline against the
    // `role` already in scope; do not add a second read.
    if (env.type === 'membership.granted') {
      const parsed = membershipGrantedPayload.safeParse(env.payload);
      if (parsed.success && parsed.data.role === 'owner' && role !== 'owner') {
        return refuse(WORKSPACE_OWNER_GRANT_REASON);
      }
    }
  }
```

with `WORKSPACE_OWNER_GRANT_REASON = 'Only a workspace owner can grant the owner role.'` beside `WORKSPACE_MEMBERSHIP_REASON` (`:69`).

- [ ] **Step 8: Run the engine and permission suites**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run && pnpm --filter @gisik-nokma/server exec vitest run test/permissions`
Expected: PASS, including the pre-existing permission cases.

- [ ] **Step 9: Mutations** — each applied to a backed-up file, confirmed to have CHANGED it, run, then restored by `cp` with matching sha256:
  - delete the `wasOwner` guard → 13.820's demote-the-only-owner case must fail;
  - change `countWorkspaceOwners(scope)` to ignore `excludingUserId` → 13.820's second case (two owners) must fail, because the demoted owner would count themselves;
  - remove the `isWorkspaceOwner` clause → the new permission case must fail.

- [ ] **Step 10: Record and commit** — cases `13.820`–`13.823`; `Features.md` ⚙️ "Engine: `last-owner` / `grant-owner-requires-owner`" with a hedge that they are not yet in the fixture suite, as the core did.

```bash
git add packages/rule-engine apps/server Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Second wave: the last-owner guard, in the engine and the permission layer"
```

---

### Task 2: The role control, with `Owner` omitted

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/members/page.tsx` (the role cell; the roster table and the `gn-members` CSS family landed in #443)
- Modify: `packages/app-core/src/views/members-roster.ts` **if and only if** #443 put the cell in a component; otherwise the page directly
- Test: `apps/web/test/members-page.test.tsx` (extend), `packages/app-core/test/views/*members*` if a component owns the cell

**Interfaces:**
- Consumes: `role` on the client (already carried end to end by #443, case `13.760`); the shared `Select` from `packages/ui` (the List's `Group by` adopted it — copy that call site's props); `membershipGrantedPayload`'s `{ userId, role }` shape; and **`POST /events`** (`apps/server/src/routes/events.ts`), the generic client batch door — the same one every other client-submitted event uses. **No new server route is needed**, and this task does not add one.
- Produces: no new exported symbol. The control ingests `membership.granted { userId, role }` through the existing `dataSource` ingest path and reloads the roster.

**A correction this task carries.** The page's docblock (`:42-52`) says the prototype's role select is omitted because there is *"NO per-member role-change door at all: no route accepts one, and `role` is written only by membership creation."* Both halves are measurable and both are wrong: `POST /events` accepts it (no type constraint) and the projection overwrites `role` on conflict, so it is written by any later grant. **The conclusion was right; the reason was not.** Rewrite that passage to state the reason that does hold — a picker was withheld because the *guards* were missing, not because the door was — and record that the earlier sentence was corrected rather than deleted, as this repo does with every refuted claim.

- [ ] **Step 1: Write the failing tests** — `apps/web/test/members-page.test.tsx`

```tsx
it('13.824 an admin sees a role control offering Admin, Member and Guest — and NOT Owner', async () => {
  renderAdminMembersPage();
  const select = await screen.findByRole('combobox', { name: /role for Kiro/i });
  const options = within(select).getAllByRole('option').map((o) => o.textContent);
  expect(options).toEqual(['Admin', 'Member', 'Guest']);
  expect(options).not.toContain('Owner');
});

it('13.825 changing a member to Guest ingests exactly one membership.granted and reloads', async () => {
  const { ingest, reload } = renderAdminMembersPage();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /role for Kiro/i }), 'Guest');
  expect(ingest).toHaveBeenCalledTimes(1);
  expect(ingest.mock.calls[0][0]).toMatchObject({ type: 'membership.granted', payload: { userId: 'u2', role: 'guest' } });
  expect(reload).toHaveBeenCalled();
});

it('13.826 a member sees the role as text and no control at all', async () => {
  renderMemberMembersPage();
  expect(screen.queryByRole('combobox', { name: /role for/i })).toBeNull();
  expect(screen.getByText('Member')).toBeTruthy();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter @gisik-nokma/web exec vitest run test/members-page.test.tsx`
Expected: FAIL — no combobox is found; the chip is a `<span>`.

- [ ] **Step 3: Implement** — replace the chip with the shared `Select` where the viewer may edit, and leave the chip where they may not. **`Owner` is absent from the options, and the docblock must say why:**

```tsx
/**
 * The role control offers Admin / Member / Guest, and deliberately NOT Owner.
 *
 * The prototype draws `Owner` here (`desktop.dc.html@6d7b67c0a52c:680-685`) and
 * the invite form does not (`:761-763`, and `check-permission.ts:373` records
 * that the invite path "refuses `owner`, and stops there"). Where the two
 * disagree, the product's own judgement wins: there is no ownership-transfer
 * flow, so minting an owner from a roster row would be a transfer with no door
 * designed for it. Promoting somebody to owner is a task of its own, not an
 * option in a dropdown. Server-side, `grant-owner-requires-owner` refuses the
 * event anyway; this is the UI agreeing with the door rather than racing it.
 */
```

- [ ] **Step 4: Run the suites**

Run: `pnpm --filter @gisik-nokma/web exec vitest run test/members-page.test.tsx && pnpm --filter @gisik-nokma/app-core exec vitest run`
Expected: PASS.

- [ ] **Step 5: Mutation** — render the select for a non-admin viewer → 13.826 must fail; add an `Owner` option → 13.824 must fail.

- [ ] **Step 6: Record and commit** — cases `13.824`–`13.826`; `Features.md` ✅ "Members: change a member's role (Admin / Member / Guest)".

```bash
git add apps/web packages/app-core Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Second wave: the members roster's role control, with Owner omitted"
```

---

## What this plan deliberately does NOT do

- **No ownership-transfer flow.** Promoting somebody to `owner` stays impossible from the UI, and the server refuses it unless the actor is already an owner. Designing that flow — who may hand over, what happens to the previous owner, whether the new owner is told — is a product decision nobody has taken, and this plan refuses to smuggle it in as a dropdown option.
- **No per-member role data beyond what the roster already carries.** #443 carried `role` end to end; nothing new is added to the wire.
- **No change to the invite form.** Its judgement is the precedent this plan follows, not a thing it edits.
