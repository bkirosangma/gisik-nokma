# Access and invite follow-ups (R1–R5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 3 and 6 touch screens. Each of them ALSO invokes `ui-ux-pro-max` alongside its workflow skill (workspace `CLAUDE.md`). The design is pinned below and built from this repo's own tokens and components; use the skill as a second opinion on focus, contrast and announcements, not as a licence to restyle.

**Goal:** Five owner-ruled changes to access, names and membership:
- **R2:** the exact-email lookup stops returning a role and refuses a guest caller.
- **R3:** nobody sees a raw user id as a person's name. A blank-name person shows their email; a guest viewer is named the people on tickets they can see; a removed person reads "Name (removed)".
- **R4:** an invitation link is accepted only by the account it was addressed to.
- **R1:** the assignee's read-time access extends to the notes and sub-tickets that INHERIT the assigned ticket's audience. The list itself is never written.
- **R5:** an owner or admin can remove a member from the workspace, which also revokes that person's pending invitations.

**Architecture:**
- **R1 is one new definition with two spellings,** the house pattern for every visibility rule. `assigneeArmTickets(db, userId, ticketIds)` (TypeScript, an upward walk) answers "which of these tickets does this user reach through an assignment", and `assigneeReachWhere(userId, params)` (SQL, a downward recursive CTE) is its list-read twin. `canSee`, `canReadNote`'s inherit arm, `visibleNotesWhere`, the rollup's `restrictedCount` and `restrictedParentsFor` all ask it. Sync needs no new code: it already asks `canSee` and `canReadNote`. An agreement case pins the two spellings equal.
- **R2 and R4 are route changes** with the refusal before any side effect.
- **R3** widens `readActorNames` (blank name → email, former members flagged `removed`) and gives a guest a scoped version of it. The client's four id-only sites go through the shared label.
- **R5** is a new route over the existing `membership.revoked` and `invite.revoked` events, plus a row action on the Members page.

**Tech Stack:** TypeScript monorepo (pnpm + turbo); Fastify + `pg` on the server (test Postgres on 54329); React 19 + Testing Library + vitest in `packages/app-core` and `apps/web`.

**Spec:** `docs/superpowers/specs/2026-09-29-access-and-invite-followups-design.md` (on `release/2026-09-29` at `42721c48`), including the late rulings: R1 = extend the arm, list untouched; N3 = narrow guest directory. Read §1–§6 before Task 1. §7–§9 (S1–S4, R7, C1–C3) are NOT this plan: the controller's fix-now batch builds them on `fix/fix-now-batch`.

## Global Constraints

- **Branch shape.**
  - Cut `task/access-followups` from `origin/release/2026-09-29`. One commit per task (Task 5 may be two: the migration, then the code).
  - Open the PR with `bash scripts/ctl/ctl pr open task/access-followups --repo <worktree> --base release/2026-09-29 --title T --body FILE`, in its own Bash call, never inside a compound chain.
  - Never use `--base main`. Never push to `main` or to the release branch.
  - CI does not run on a dev PR into a release branch. The verification is your LOCAL run: name it as local, and paste `NODE=` beside it.
- **Task 4 waits for the fix-now batch.** It edits `apps/server/src/routes/invites.ts`, which `fix/fix-now-batch` (S3/S4) also edits. Do not start Task 4 until that batch has landed in `release/2026-09-29`; then `git merge --no-edit origin/release/2026-09-29` into this branch first. Tasks 1–3 and 5–6 do not touch that file.
- **Node 22 for every run.** `node --version` must print `v22.*` in the same shell. Under Node 24, `pnpm install` exits 1 silently (measured 2026-09-29).
- **Build before suites.** `pnpm turbo run build` at the repo root before any package's vitest run.
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism <files> > /tmp/followups-<pkg>.log 2>&1; tail -25 /tmp/followups-<pkg>.log`. **Never pipe a test run into `head`.**
- **Every new case:** RED first; a control in the SAME `it`; a named mutation, applied after the commit and reverted, whose failing test you paste into the task's progress line.
- **Catalogue in the same commit:** `Features.md` §6 (and §3 for the client label bullets) plus `test-cases/06-auth-visibility.md`. A test's name carries its case id so `pnpm check:citations` finds it.
- **Copy, verbatim:**
  - R4 refusal: `This invitation was sent to {masked}. Sign in with that account to accept it.`
  - R5 menu item: `Remove from workspace…`; confirm title `Remove {label} from {workspace}?`; confirm body `They lose access at once. Their history stays, tickets stay assigned to them marked "(removed)", and any invitation still pending for them is withdrawn.`; confirm button `Remove`.
  - Removed marker: ` (removed)` appended to the label.
  - Unknown person: `Unknown person`.

## Case-id block

**`6.240`–`6.299` is ALLOCATED to this plan** (2026-09-29). Measured: §6's highest id is `6.219` (`test-cases/06-auth-visibility.md:367` allocates `6.180`–`6.219` to the access plan). No remote branch uses a `6.22x`+ id (swept 2026-09-29). **`6.220`–`6.239` is left for the controller's fix-now batch**, whose S4 dedupe cases belong in §6 and which may be allocating from "the next free id" concurrently. State that in the file's allocation line.

| Task | Ids used | Reserved and unused |
|---|---|---|
| 1 — R2 lookup | 6.240–6.241 (+ amends 6.204, 6.205, 6.206) | 6.242–6.244 |
| 2 — R3 server names | 6.245–6.250 | 6.251–6.252 |
| 3 — R3 client labels | 6.253–6.257 | 6.258–6.259 |
| 4 — R4 link acceptance | 6.260–6.265 | 6.266–6.267 |
| 5 — R1 arm extension | 6.268–6.279 (+ amends 6.191, 6.190) | — |
| 6 — R5 remove | 6.280–6.288 | 6.289–6.299 |

## Recorded deviations from the spec (each measured on `42721c48`)

- **FD1 — The rollup and the restricted-parent chip were ALREADY inconsistent with `canSee`, not merely "not opened".** `rollupFor` asks `canSeeResolved` only (`apps/server/src/visibility/rollup.ts:301-306`), and so does `restrictedParentsFor` (`apps/server/src/read/restricted-parents.ts:97-102`). So today a child assigned DIRECTLY to the viewer is counted as "restricted" in its parent's rollup, and a parent assigned to the viewer is reported as a restricted parent, while `canSee` admits both. The docblock at `can-see.ts:180-184` says this was deliberate ("the ticket's relatives are not opened either"). Under the R1 ruling ("every reader agrees", spec A5), Task 5 makes both readers ask the arm too. That widens them for direct assignments as well as inherited ones. It is recorded here because it changes two ✅ behaviours beyond the ones the spec named.
- **FD2 — Spec N3's premise is false.** It says a guest's payloads "already carry those people's labels". They do not: board, list, My Work, notifications, history, comments and notes payloads carry ids only (the research pass; `packages/app-core/src/online/mappers.ts:618` maps an assignee id through a roster map). So Task 2 gives a guest a SCOPED `/actor-names`: only the people who appear on tickets the guest can see (assignees of those tickets and actors of events filed against them).
- **FD3 — Spec N1's "synthetic phone addresses show the phone number, formatted" is NOT built.** It contradicts `readActorNames`' own rule (`apps/server/src/routes/builder-reads.ts:303-306`: a phone user's "name IS their phone number … the roster withholds that address for exactly this reason") and the 2026-09-29 names ruling that phones stay gated. A phone user keeps today's rule: labelled where the roster already carries them. A phone user with a blank name that nobody's roster carries reads `Unknown person` (N4). Owner may overrule; the change would be one branch in `readActorNames`.
- **FD4 — Phone invites store the address exactly as typed.** The mint route writes `address` verbatim (`apps/server/src/routes/invites.ts:340-352`), so spec I2's "verified phone equals the address" is implemented as a DIGITS-ONLY comparison (`replace(/[^0-9]/g, '')` both sides, the same normalisation `syntheticPhoneEmail` uses at `apps/server/src/auth/synthetic-address.ts:46-48`).
- **FD5 — R4 breaks the suite's own join helper, and the plan pays for it inside Task 4.** `apps/server/test/routes/invites.test.ts:114-120` (`joinViaInvite`) signs a joiner in by PHONE and accepts an EMAIL invite addressed to `${role}-N@example.com`, which is exactly the forwarded-link case R4 refuses. There are 19 `/accept` calls in that file and 1 in `people.test.ts`. Task 4 rewrites the helper to invite the joiner's own phone number on the phone channel, and amends each accept that relied on a mismatch.
- **FD6 — Spec M4's "(removed)" needs names for people who are no longer members, and today nobody serves them.** `readActorNames` reads only CURRENT workspace-scope memberships (`builder-reads.ts:311-318`; its docblock at `:307-309` says a removed person "is unchanged (their id)"). Task 2 adds former members (anyone a `membership.granted` in this workspace named who has no current row) with `removed: true`; Task 3 folds the suffix into the label in ONE place (`mapActorNames`).
- **FD7 — Spec A2's note clause is "notes attached to T that inherit its audience".** `canReadNote`'s inherit arm is ANY attached live ticket (`apps/server/src/visibility/can-read-note.ts:76-79`). The extension keeps that shape: an `inherit` note is readable if ANY attached live ticket is in the viewer's arm reach. So a note attached to both an assigned ticket and an unrelated one is readable by the assignee.

## Review Focus

1. **Deep and wide trees in the arm.** A ticket assigned to a guest with a 4-deep chain of inheriting descendants, one of which authors its own explicit list: the guest sees every inheriting descendant down to (not including) the one with its own audience, and that one's inheriting children too only if the guest is on its list. Task 5 case 6.270.
2. **Reassignment mid-tree.** Assigning T to someone else removes the whole extended subtree at once; assigning a CHILD of T separately keeps that child's own subtree. Task 5 case 6.271.
3. **A removed person's own assigned tickets.** After R5, the person reaches nothing (the arm needs a workspace role), and their name on the card reads "Name (removed)", never an id. Tasks 5 (6.276) and 6 (6.286).
4. **A guest viewer's names.** A guest sees the names of the people on their tickets and nobody else's, and `/members` still 404s for them. Task 2 case 6.248.
5. **A link opened by the right person on a second device, or by the right person with a differently-cased email.** Accepted. Task 4 case 6.262.

## File map

| File | Task | Change |
|---|---|---|
| `apps/server/src/routes/people.ts` | 1 | drop `role`; refuse a guest caller |
| `packages/app-core/src/people/types.ts` | 1 | `LookedUpPerson` loses `role` |
| `apps/server/src/routes/builder-reads.ts` | 2 | `readActorNames` (email label, former members), `readActorNamesForGuest`; the route's door |
| `packages/domain/src/read-models.ts` | 2 | `ActorName` gains optional `removed` |
| `packages/app-core/src/online/mappers.ts` | 3 | `mapActorNames` folds ` (removed)` |
| `packages/app-core/src/member-label.ts` | 3 | `actorLabel`'s floor becomes `Unknown person` |
| `packages/app-core/src/views/ticket-list.tsx`, `my-work.tsx`, `visibility-editor.tsx`; `packages/domain/src/events/contest-events.ts` | 3 | id-only sites take a label |
| `apps/server/src/routes/invites.ts`; new `apps/server/src/invites/address-match.ts` | 4 | the match check before the consume; the mask |
| new `apps/server/migrations/1790700000000_arm-reach-indexes.sql` | 5 | `proj_tickets (assignee_id)` index |
| new `apps/server/src/visibility/assignee-arm.ts` | 5 | `assigneeArmTickets` |
| `apps/server/src/visibility/can-see.ts`, `can-read-note.ts`, `rollup.ts`; `apps/server/src/read/visible-where.ts`, `restricted-parents.ts` | 5 | every reader asks the arm |
| new `apps/server/src/routes/members.ts`; `apps/server/src/app.ts` | 6 | `POST …/members/:userId/remove` |
| `apps/web/app/w/[workspaceId]/members/page.tsx`; `packages/app-core/src/online/*` | 6 | the row action and its gateway |

---

### Task 1: R2 — the email lookup returns no role and refuses a guest

**Files:**
- Modify: `apps/server/src/routes/people.ts:24-30` (`LookedUpPerson`), `:46-67` (`lookupPerson`), `:124-131` (the route handler)
- Modify: `packages/app-core/src/people/types.ts:4-10`
- Test: `apps/server/test/routes/people.test.ts` (amend 6.204–6.206 at `:139-171`; add 6.240–6.241)
- Catalogue: `test-cases/06-auth-visibility.md` (the "Finding an account" section, `:401`+), `Features.md:573`

**Interfaces:**
- Produces: `LookedUpPerson = { userId: string; name: string; email: string; inWorkspace: boolean }` on both sides. No client code reads `role` (measured: the only readers of the lookup result read `name`, `email`, `userId` and `inWorkspace` — `apps/web/app/w/[workspaceId]/members/page.tsx:856`, `packages/app-core/src/views/new-ticket-dialog.tsx:879,1299`, `outsider-finder.tsx:112`, `ticket-sheet.tsx:2794`).

Cases:

```markdown
- ❌ **6.240 — a GUEST of the workspace calling `people-lookup` gets the shared 404 (`READ_NOT_FOUND_BODY`) and no account is named;** control: a MEMBER calling it with the same address gets the account. Mutation: restore `requireMember` alone as the door.
- ❌ **6.241 — the lookup body carries exactly four keys, `userId`, `name`, `email`, `inWorkspace` — no `role` — for a member of the workspace and for a stranger alike;** control: `inWorkspace` is `true` for the member and `false` for the stranger. Mutation: add `role: eff.workspaceRole` back to the returned object.
```

Amend in place (never renumber), appending to each: "Amended 2026-09-29 by the access follow-ups plan (R2, owner ruling): …"
- 6.204 → "exactly FOUR fields"; its control keeps `inWorkspace: false` and drops `role: null`.
- 6.205 → its control becomes "a MEMBER of the workspace may look up" (a guest is now refused, 6.240).
- 6.206 → "a member comes back `inWorkspace: true`" (no role).

- [ ] **Step 1: Write the cases** into the section and the allocation line (see "Case-id block").

- [ ] **Step 2: Write the failing tests** in `people.test.ts`, beside 6.202–6.207, using the file's own helpers (`byEmail`, `found`, `join`, `lookup`):

```ts
describe('6.240–6.241 R2 — no role, no guests', () => {
  it('6.240 a guest caller gets the shared 404; CONTROL: a member gets the account', async () => {
    const owner = await byEmail(`owner-${newUlid()}@example.test`);
    const ws = await found(owner);
    const guest = await byEmail(`guest-${newUlid()}@example.test`);
    const member = await byEmail(`member-${newUlid()}@example.test`);
    const target = await byEmail(`target-${newUlid()}@example.test`);
    await join(owner, ws, guest, 'guest');
    await join(owner, ws, member, 'member');
    const targetEmail = (await roleless(target)).email;

    const refused = await lookup(guest, ws, targetEmail);
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual(READ_NOT_FOUND_BODY);
    // CONTROL — same address, a member caller.
    const ok = await lookup(member, ws, targetEmail);
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { user: { userId: string } }).user.userId).toBe(target.userId);
  });

  it('6.241 exactly four keys, no role; CONTROL: inWorkspace tells member from stranger', async () => {
    const owner = await byEmail(`owner-${newUlid()}@example.test`);
    const ws = await found(owner);
    const member = await byEmail(`m-${newUlid()}@example.test`);
    const stranger = await byEmail(`s-${newUlid()}@example.test`);
    await join(owner, ws, member, 'member');
    for (const [who, inWorkspace] of [[member, true], [stranger, false]] as const) {
      const { user } = (await lookup(owner, ws, (await roleless(who)).email)).json() as { user: Record<string, unknown> };
      expect(Object.keys(user).sort()).toEqual(['email', 'inWorkspace', 'name', 'userId']);
      expect(user['inWorkspace']).toBe(inWorkspace);
    }
  });
});
```

  `roleless(caller)` is a two-line helper you add at the top of the file: it reads `SELECT email FROM "user" WHERE id = $1` and returns `{ email }`. (The file's `byEmail` already knows the address it signed in with; if it returns it, use that instead and drop the helper.)

- [ ] **Step 3: Run to see it fail.** `pnpm turbo run build`, `docker compose up -d postgres`, then `cd apps/server && pnpm exec vitest run --no-file-parallelism test/routes/people.test.ts > /tmp/followups-server.log 2>&1; tail -25 /tmp/followups-server.log`. Expected: 6.240 and 6.241 FAIL (the guest gets 200; a fifth key `role`). 6.204–6.206 as amended also fail.

- [ ] **Step 4: Implement.**
  1. `people.ts:24-30`: delete the `role` line from `LookedUpPerson`.
  2. `people.ts:62-66`: delete `role: eff.workspaceRole,`. Keep `inWorkspace: eff.workspaceRole !== null`.
  3. The handler (`:127-129`):

```ts
      const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
      // R2 (owner ruling 2026-09-29): a guest may not look people up. The same
      // 404 a non-member gets — the route does not confirm the workspace to them.
      if (eff === null || eff.workspaceRole === 'guest') {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
```
  4. `packages/app-core/src/people/types.ts`: delete the `role` line.
  5. Amend the lookup's docblock (`people.ts:32-45`): add one bullet, "- NO ROLE and NO GUEST CALLER (R2, owner ruling 2026-09-29): the pickers need only `inWorkspace`, and a guest is not given a people directory."

- [ ] **Step 5: Run to see it pass.** Same command, then `pnpm turbo run typecheck` (the removed field must break no client). Expected: green.

- [ ] **Step 6: Catalogue and commit.** Flip 6.240–6.241 to ✅, keep the amended 6.204–6.206 ✅. Edit `Features.md:573`'s bullet: replace "carries the role" (or its equivalent wording) with "carries no role (R2) and refuses a guest caller". Commit `R2: people-lookup drops the role and refuses a guest (6.240-6.241; 6.204-6.206 amended)`.

---

### Task 2: R3 (server) — `/actor-names` labels blank names by email, names former members, and serves a guest their own tickets' people

**Files:**
- Modify: `apps/server/src/routes/builder-reads.ts:285-323` (`readActorNames`), `:755-769` (the route)
- Modify: `packages/domain/src/read-models.ts:753` (`ActorName`)
- Test: `apps/server/test/routes/builder-reads.test.ts` (the actor-names block; add 6.245–6.250)
- Catalogue: `test-cases/06-auth-visibility.md`, `Features.md:428`

**Interfaces:**
- Produces: `ActorName = { userId: string; displayName: string; removed?: true }`. `removed` is present only when true.
- Produces: `readActorNames(db, workspaceId): Promise<ActorName[]>` (members + former members) and `readActorNamesForGuest(db, workspaceId, guestId): Promise<ActorName[]>`.

Cases:

```markdown
- ❌ **6.245 — a member with a BLANK name is served with their verified email as `displayName`;** control: a member with a name is served by name. Mutation: restore the `display_name.trim() !== ''` filter.
- ❌ **6.246 — a phone-signed member (synthetic address) with a blank name is still NOT served (FD3);** control: a phone member WITH a name is also not served, exactly as before. Mutation: drop the `isSyntheticPhoneEmail` filter.
- ❌ **6.247 — a FORMER member (granted, then revoked) is served with `removed: true` and their name (or email);** control: a current member carries no `removed` key at all. Mutation: drop the former-members half of the union.
- ❌ **6.248 — a GUEST caller gets 200 with ONLY the people on tickets they can see: the assignee of a ticket on their list and the actor who created it — not a member who never touched those tickets;** control: `/members` still answers the same guest 404. Mutation: serve the guest `readActorNames` (the whole workspace).
- ❌ **6.249 — the guest's list follows visibility NOW: once the guest is taken off the ticket's list, its people drop out of their names;** control: a second ticket still on their list keeps its people. Mutation: read the guest's tickets without the audience predicate.
- ❌ **6.250 — a person in ANOTHER workspace, and a person nobody in this workspace ever granted, are never served, to a member or to a guest;** control: this workspace's members are. Mutation: remove the `workspace_id` clause from the former-members query.
```

- [ ] **Step 1: Write the cases.**

- [ ] **Step 2: Write the failing tests** in `builder-reads.test.ts` beside the existing actor-names cases. Follow that file's own fixture helpers for making members, guests and tickets (read its top 120 lines first and reuse its `seedMember`/`seedGuest`/`seedTicket`/`revokeMember`/`setVisibilityEnv` calls; accounts need rows in `"user"` with `name`, `email`, `emailVerified = true`, which the file's existing actor-names cases already insert — copy their insert). The shape of each test, for 6.245 and 6.248:

```ts
it('6.245 a blank-name member is served by email; CONTROL: a named member by name', async () => {
  const w = await actorWorld(); // your helper: ws, owner, named member, blank member (email blank@example.test)
  const res = await getAs(w.owner, `/v1/workspaces/${w.ws}/actor-names`);
  expect(res.statusCode).toBe(200);
  const names = (res.json() as { names: { userId: string; displayName: string }[] }).names;
  expect(names.find((n) => n.userId === w.blank)?.displayName).toBe('blank@example.test');
  expect(names.find((n) => n.userId === w.named)?.displayName).toBe('Rina Marak');
});

it('6.248 a guest is named only the people on their tickets; CONTROL: /members still 404s for them', async () => {
  const w = await actorWorld();
  // T is explicit to the guest, created by `creator` and assigned to `assignee`;
  // `bystander` is a member who never touched T.
  const res = await getAs(w.guest, `/v1/workspaces/${w.ws}/actor-names`);
  expect(res.statusCode).toBe(200);
  const ids = (res.json() as { names: { userId: string }[] }).names.map((n) => n.userId).sort();
  expect(ids).toEqual([w.creator, w.assignee].sort());
  expect((await getAs(w.guest, `/v1/workspaces/${w.ws}/members`)).statusCode).toBe(404);
});
```

- [ ] **Step 3: Run to see it fail.** `cd apps/server && pnpm exec vitest run --no-file-parallelism test/routes/builder-reads.test.ts > /tmp/followups-server.log 2>&1; tail -25 /tmp/followups-server.log`. Expected: 6.245, 6.247, 6.248, 6.249 FAIL; 6.246 and 6.250 pass already (they are guards; say so in the progress line).

- [ ] **Step 4: Implement.**
  1. `read-models.ts:753`: `export type ActorName = { userId: string; displayName: string; removed?: true };`
  2. Replace `readActorNames` (`builder-reads.ts:311-323`) and extend its docblock's "What is left out" list (the blank-name bullet becomes "A blank name is labelled by the verified email (R3, owner ruling 2026-09-29: 'show email')"; the removed-person bullet becomes "A FORMER member is served with `removed: true` (R5/FD6)"):

```ts
export async function readActorNames(db: Queryable, workspaceId: string): Promise<ActorName[]> {
  const { rows } = await db.query<{ user_id: string; display_name: string | null; email: string; removed: boolean }>(
    `SELECT m.user_id, u."name" AS display_name, u."email", FALSE AS removed
       FROM proj_memberships m
       JOIN "user" u ON u."id" = m.user_id
      WHERE m.workspace_id = $1 AND m.scope_kind = 'workspace'
     UNION
     SELECT DISTINCT e.payload->>'userId', u."name", u."email", TRUE
       FROM events e
       JOIN "user" u ON u."id" = e.payload->>'userId'
      WHERE e.workspace_id = $1 AND e.type = 'membership.granted'
        AND NOT EXISTS (SELECT 1 FROM proj_memberships m2
                         WHERE m2.workspace_id = $1 AND m2.scope_kind = 'workspace'
                           AND m2.user_id = e.payload->>'userId')
     ORDER BY 1`,
    [workspaceId],
  );
  return rows.flatMap(labelled);
}

/** One row → its label, or nothing (FD3: a phone user is never labelled here). */
function labelled(row: { user_id: string; display_name: string | null; email: string; removed: boolean }): ActorName[] {
  if (isSyntheticPhoneEmail(row.email)) return [];
  const name = (row.display_name ?? '').trim();
  const displayName = name !== '' ? name : row.email.trim();
  if (displayName === '') return [];
  return [row.removed ? { userId: row.user_id, displayName, removed: true } : { userId: row.user_id, displayName }];
}
```

  3. Add `readActorNamesForGuest` beside it. The guest's tickets are exactly `visibleTicketsWhere` for the guest (import it and `SqlParams` from `../read/visible-where.js` / `../read/sql-params.js`; after Task 5 that predicate includes the arm, so the guest's assigned tickets' people come along automatically):

```ts
/**
 * FD2 / spec N3 (owner ruling 2026-09-29, "go with the recommendation"): a guest
 * is named the people on the tickets they can see — each such ticket's current
 * assignee and every actor of an event filed against it — and nobody else.
 */
export async function readActorNamesForGuest(db: Queryable, workspaceId: string, eff: EffectiveRole, guestId: string): Promise<ActorName[]> {
  const params = new SqlParams();
  const ws = params.add(workspaceId);
  const visible = `SELECT v.ticket_id FROM proj_visibility v JOIN proj_tickets t ON t.ticket_id = v.ticket_id
                    WHERE v.workspace_id = ${ws} AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, guestId, params)}`;
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT t.assignee_id AS user_id FROM proj_tickets t WHERE t.ticket_id IN (${visible}) AND t.assignee_id IS NOT NULL
     UNION
     SELECT e.actor_id FROM events e WHERE e.workspace_id = ${ws} AND e.entity_kind = 'ticket' AND e.entity_id IN (${visible})`,
    params.toArray(),
  );
  const wanted = new Set(rows.map((r) => r.user_id));
  return (await readActorNames(db, workspaceId)).filter((n) => wanted.has(n.userId));
}
```

  4. The route (`:755-769`): replace the `'no-guests'` door with `'members-only'`, then branch:

```ts
      const eff = await door(request, workspaceId, 'members-only');
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const names =
        eff.workspaceRole === 'guest'
          ? await readActorNamesForGuest(deps.pool, workspaceId, eff, request.currentUserId)
          : await readActorNames(deps.pool, workspaceId);
      const body: ActorNameListResponse = { workspaceId, names };
      return body;
```
  Replace the route's comment block (`:760-764`) with: "A guest is served the people on their own tickets only (FD2, owner ruling 2026-09-29); the roster (`/members`) stays `no-guests`."

- [ ] **Step 5: Run to see it pass**, then the whole server suite (`cd apps/server && pnpm exec vitest run --no-file-parallelism > /tmp/followups-server.log 2>&1; tail -40 /tmp/followups-server.log`). Any existing actor-names case that asserted "a blank name is left out" or "a guest gets 404" is now wrong BY RULING: amend it in place with "Amended 2026-09-29 by 6.245/6.248 (R3)" and list each in the progress line.

- [ ] **Step 6: Catalogue and commit.** `Features.md:428` bullet: add "a blank name is labelled by email; a former member is named with `removed`; a guest is named the people on their own tickets (R3, 2026-09-29)". Commit `R3 server: actor-names labels blank names by email, names former members, scopes a guest (6.245-6.250)`.

---

### Task 3: R3 (client) — no raw id as a name, anywhere

**Files:**
- Modify: `packages/app-core/src/online/mappers.ts:515-524` (`mapActorNames`)
- Modify: `packages/app-core/src/member-label.ts` (`actorLabel`'s floor)
- Modify: `packages/app-core/src/views/ticket-list.tsx:1150,1235` (+ `TicketListProps`, `:94`)
- Modify: `packages/domain/src/events/contest-events.ts:148-156` and its caller `packages/app-core/src/views/my-work.tsx`
- Modify: `packages/app-core/src/views/visibility-editor.tsx:373-376`
- Modify (wiring): `apps/web` hosts of `TicketList` and `MyWork` pass `useActorLabels([workspaceId])` (`apps/web/src/use-actor-labels.ts:29`)
- Test: `packages/app-core/test/online/mappers.test.ts`, `test/member-label.test.ts`, `test/views/ticket-list.test.tsx`, `test/views/my-work.test.tsx`, `test/views/visibility-editor.test.tsx`
- Catalogue: `test-cases/06-auth-visibility.md`, `Features.md` §3 (the labels bullet near `:428`)

**Interfaces:**
- Consumes: Task 2's `ActorName.removed`.
- Produces: `TicketListProps.actorLabelOf?: (userId: string) => string` and `MyWorkProps.actorLabelOf?: (userId: string) => string`, each defaulting to `(id) => actorLabel(id, null)`. `renderContestedClaimAttribution(claim, actorLabel?: string)`.
- Produces: `UNKNOWN_PERSON = 'Unknown person'`, exported from `member-label.ts`.

Cases:

```markdown
- ❌ **6.253 — `mapActorNames` labels a row carrying `removed: true` as `Name (removed)`;** control: a row without it keeps its bare name. Mutation: ignore `removed`.
- ❌ **6.254 — `actorLabel(id, null)` for an id no source names reads `Unknown person`, never the id;** control: a system actor keeps its own label, and a named id its name. Mutation: restore the id floor.
- ❌ **6.255 — the List's "closed by" and "set by" tooltips name the person through `actorLabelOf`;** control: without the prop they read `Unknown person`, not the id. Mutation: pass `row.closed.actorId` straight into the title.
- ❌ **6.256 — My Work's contested-claim line names the claimant through `actorLabelOf`;** control: a label-less call reads `Unknown person`. Mutation: render `claim.actorId`.
- ❌ **6.257 — the visibility editor's chips name an off-roster person through the names read (`actorLabelFrom`), not the id;** control: a roster person keeps the roster label. Mutation: revert `nameOf` to the roster-only lookup.
```

- [ ] **Step 1: Write the cases.**

- [ ] **Step 2: Write the failing tests.** For 6.253 (`mappers.test.ts`):

```ts
it('6.253 a removed row reads "Name (removed)"; CONTROL: a current row keeps its bare name', () => {
  const actors = mapActorNames({
    names: [
      { userId: 'u1', displayName: 'Rina Marak', removed: true },
      { userId: 'u2', displayName: 'Tengsim' },
    ],
  });
  expect(actors).toEqual([
    { id: 'u1', name: 'Rina Marak (removed)' },
    { id: 'u2', name: 'Tengsim' },
  ]);
});
```

  For 6.254 (`member-label.test.ts`): `expect(actorLabel('01JQ0000000000000000000000', null)).toBe('Unknown person')`, control `expect(actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, null)).toBe(<its existing label>)` and `expect(actorLabel('u', 'Rina')).toBe('Rina')`. For 6.255–6.257, render the component with the prop and read the title/chip text by role (follow each file's existing render helper).

- [ ] **Step 3: Run to see it fail** (`cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/online/mappers.test.ts test/member-label.test.ts test/views/ticket-list.test.tsx test/views/my-work.test.tsx test/views/visibility-editor.test.tsx > /tmp/followups-app-core.log 2>&1; tail -30 /tmp/followups-app-core.log`).

- [ ] **Step 4: Implement.**
  1. `mapActorNames`: `name: row['removed'] === true ? \`${displayName} (removed)\` : displayName`, reading `removed` only when it is the boolean `true` (anything else is ignored, the mapper's existing strictness).
  2. `member-label.ts`: export `UNKNOWN_PERSON`, and make `actorLabel`'s final floor return it instead of the id. **Then `git grep -n "actorLabel(" packages apps` and run the whole app-core and web suites:** every test that asserted the raw-id floor is now wrong by ruling (spec N4). Amend each in place ("Amended 2026-09-29 by 6.254 (R3 N4)"), and list them in the progress line.
  3. `ticket-list.tsx`: add `actorLabelOf` to `TicketListProps` (docblock: "What to call a person id in the row tooltips; the host passes `useActorLabels`. Default: the shared floor."), destructure it with the default, and use it at `:1150` and `:1235`.
  4. `contest-events.ts`: `renderContestedClaimAttribution(claim, actorLabel?: string)` renders `claimed by ${actorLabel ?? 'Unknown person'}`; rewrite its docblock's "rendered by RAW ID" paragraph to say the caller supplies the label (R3). `my-work.tsx` passes `actorLabelOf(claim.actorId)` through a new `actorLabelOf` prop (same default as the list).
  5. `visibility-editor.tsx:373-376`: `nameOf` becomes `actorLabelFrom(userId, members, names) ?? actorLabel(userId, null)`, with `names` from the `useActorNames` hook the sheet already uses (`packages/app-core/src/views/ticket-sheet.tsx:18`) passed down as a prop.
  6. Wire `actorLabelOf={useActorLabels([workspaceId])}` in the web hosts of `TicketList` and `MyWork` (find them with `git grep -n "<TicketList\|<MyWork" apps/web`).

- [ ] **Step 5: Run to see it pass** (app-core and web suites, then `pnpm turbo run typecheck`).

- [ ] **Step 6: Catalogue and commit.** Commit `R3 client: no raw id as a name — removed suffix, Unknown person floor, four id-only sites (6.253-6.257)`.

---

### Task 4: R4 — an invitation link is accepted only by the account it was sent to

**⛔ Start only after the fix-now batch (`fix/fix-now-batch`) has landed in `release/2026-09-29`, then merge it in (Global Constraints).**

**Files:**
- Create: `apps/server/src/invites/address-match.ts`
- Modify: `apps/server/src/routes/invites.ts` — the accept handler (`:468-511` on `42721c48`; re-read after the merge), `openableInvite` (`:614-640`), the module docblock's "What acceptance does NOT do" (`:288-300`)
- Test: create `apps/server/test/invites/address-match.test.ts`; modify `apps/server/test/routes/invites.test.ts` (the `joinViaInvite` helper `:114-120` and every mismatched accept, FD5), `apps/server/test/routes/people.test.ts` (its one accept)
- Catalogue: `test-cases/06-auth-visibility.md`, `Features.md:554`

**Interfaces:**
- Produces: `addressMatchesAccount(channel: 'email' | 'phone', address: string, account: { email: string; emailVerified: boolean; phoneNumber: string | null; phoneNumberVerified: boolean | null }): boolean` and `maskAddress(channel: 'email' | 'phone', address: string): string`.
- Produces: `INVITE_NOT_YOURS_STATUS = 403` and `inviteNotYoursBody(masked: string) = { error: 'not_yours', message: \`This invitation was sent to ${masked}. Sign in with that account to accept it.\` }`.

Cases:

```markdown
- ❌ **6.260 — `addressMatchesAccount`: an email invite matches a VERIFIED email equal case-insensitively after trimming; a phone invite matches a VERIFIED phone equal on digits alone (`+91 90014-00001` = `919001400001`); an unverified email or phone never matches; a synthetic phone address never matches an email invite;** control: the exact same account matches its own address. Mutation: drop the `emailVerified` term.
- ❌ **6.261 — a link accepted by a DIFFERENT account answers 403 with `This invitation was sent to a•••@example.com. Sign in with that account to accept it.`, appends nothing, and does NOT spend the link;** control: the addressed account then accepts the same link and joins. Mutation: move the check after `consumeInviteToken`.
- ❌ **6.262 — the addressed account accepts regardless of address case;** control: a different account with the same local part at another domain is refused. Mutation: compare without lower-casing.
- ❌ **6.263 — a phone-channel invite is accepted by the account whose verified phone it names, and refused (403, phone masked to its last two digits) for an account with no verified phone;** control: the same link then opens for the right phone account. Mutation: treat a null `phoneNumber` as a match.
- ❌ **6.264 — `maskAddress` shows an email as its first character, `•••`, and the whole domain, and a phone as `•••` plus its last two digits;** control: a one-character local part still shows `•••` after it (never the whole address). Mutation: return the address unmasked.
- ❌ **6.265 — an EXISTING member opening a link addressed to someone else is refused too, and their role is unchanged;** control: before this plan the same request answered 200 (recorded in the test's comment, not asserted). Mutation: skip the check when the acceptor already has a role.
```

- [ ] **Step 1: Write the cases.** Also amend any existing invites case that asserted "a link is bearer-authorised" (grep `test-cases/06-auth-visibility.md` for `bearer`) with "Amended 2026-09-29 by 6.261 (R4, owner ruling 'refuse')".

- [ ] **Step 2: Write the failing unit test** `address-match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addressMatchesAccount, maskAddress } from '../../src/invites/address-match.js';

const account = (over: Partial<Parameters<typeof addressMatchesAccount>[2]> = {}) => ({
  email: 'Rina@Example.com', emailVerified: true, phoneNumber: '+919001400001', phoneNumberVerified: true, ...over,
});

describe('6.260 addressMatchesAccount', () => {
  it('6.260 email case-insensitive + trimmed, phone digits-only, unverified never; CONTROL: exact self-match', () => {
    expect(addressMatchesAccount('email', 'Rina@Example.com', account())).toBe(true); // control
    expect(addressMatchesAccount('email', '  rina@example.COM ', account())).toBe(true);
    expect(addressMatchesAccount('email', 'rina@example.com', account({ emailVerified: false }))).toBe(false);
    expect(addressMatchesAccount('phone', '+91 90014-00001', account())).toBe(true);
    expect(addressMatchesAccount('phone', '+919001400001', account({ phoneNumberVerified: false }))).toBe(false);
    expect(addressMatchesAccount('phone', '+919001400001', account({ phoneNumber: null }))).toBe(false);
    expect(addressMatchesAccount('email', '919001400001@phone.gisik-nokma.invalid',
      account({ email: '919001400001@phone.gisik-nokma.invalid' }))).toBe(false);
  });
});

describe('6.264 maskAddress', () => {
  it('6.264 email first char + ••• + domain, phone ••• + last two; CONTROL: a one-char local part', () => {
    expect(maskAddress('email', 'bkirosangma@gmail.com')).toBe('b•••@gmail.com');
    expect(maskAddress('phone', '+919001400001')).toBe('•••01');
    expect(maskAddress('email', 'a@x.test')).toBe('a•••@x.test'); // control: never the whole address
  });
});
```

- [ ] **Step 3: Write the failing route tests** (6.261–6.263, 6.265) in `invites.test.ts`, then **rewrite `joinViaInvite`** (FD5) so the file stays green under the new rule:

```ts
async function joinViaInvite(owner: Caller, workspaceId: string, role: string): Promise<Caller> {
  phoneCounter += 1;
  const phone = `+9190014${String(phoneCounter).padStart(5, '0')}`;
  const joiner = withHeaders(await signInWithPhone(app, otp, phone));
  // R4 (owner ruling 2026-09-29): the link opens only for the account it names,
  // so the joiner is invited on the phone they signed in with.
  const { token } = await mintOk(owner, workspaceId, { role, channel: 'phone', address: phone });
  const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: joiner.headers });
  expect(res.statusCode, res.body).toBe(200);
  return joiner;
}
```

  Then run the file and fix every OTHER accept that relied on a mismatch the same way (invite the acceptor's own phone, or sign the acceptor in by the invited email with `signInWithEmail`). Each fix gets a one-line comment `// R4: the acceptor is the addressed account.` Do the same for `people.test.ts`'s one accept. Do NOT weaken an assertion to make it pass.

- [ ] **Step 4: Run to see the new cases fail** and the rewritten helper's callers pass: `cd apps/server && pnpm exec vitest run --no-file-parallelism test/invites/address-match.test.ts test/routes/invites.test.ts test/routes/people.test.ts test/routes/my-invitations.test.ts > /tmp/followups-server.log 2>&1; tail -40 /tmp/followups-server.log`.

- [ ] **Step 5: Implement.**
  1. `address-match.ts` (new):

```ts
import { isSyntheticPhoneEmail } from '../auth/synthetic-address.js';

type Account = { email: string; emailVerified: boolean; phoneNumber: string | null; phoneNumberVerified: boolean | null };
const digits = (s: string): string => s.replace(/[^0-9]/g, '');

/**
 * Is this account the one an invitation was addressed to (R4, owner ruling
 * 2026-09-29: an invitation link opened by any other account is REFUSED)?
 * Email: verified, equal case-insensitively after trimming — the banner door's
 * comparison (`routes/my-invitations.ts:147`). Phone: verified, equal on digits
 * alone, because the mint stores the address as typed (FD4).
 */
export function addressMatchesAccount(channel: 'email' | 'phone', address: string, account: Account): boolean {
  if (channel === 'email') {
    if (!account.emailVerified || isSyntheticPhoneEmail(account.email)) return false;
    return account.email.trim().toLowerCase() === address.trim().toLowerCase();
  }
  if (account.phoneNumber === null || account.phoneNumberVerified !== true) return false;
  const want = digits(address);
  return want !== '' && digits(account.phoneNumber) === want;
}

/** The address as the refusal may say it: enough to recognise, not enough to learn. */
export function maskAddress(channel: 'email' | 'phone', address: string): string {
  if (channel === 'phone') return `•••${digits(address).slice(-2)}`;
  const at = address.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${address.slice(0, 1)}•••${address.slice(at)}`;
}
```

  2. `openableInvite`: add `address, channel` to the `proj_invites` SELECT and to `InviteRow`.
  3. The accept handler, between the `openableInvite` 404 and `consumeInviteToken`:

```ts
      // R4 (owner ruling 2026-09-29: "refuse"). BEFORE the consume, so a
      // wrong-account attempt does not burn the link for the person it names.
      const account = await accountOf(deps.pool, request.currentUserId);
      if (account === null || !addressMatchesAccount(invite.channel, invite.address, account)) {
        return reply.code(INVITE_NOT_YOURS_STATUS).send(inviteNotYoursBody(maskAddress(invite.channel, invite.address)));
      }
```
  with `accountOf` reading `SELECT "email", "emailVerified", "phoneNumber", "phoneNumberVerified" FROM "user" WHERE "id" = $1`.
  4. Rewrite the module docblock's "What acceptance does NOT do" paragraph (`:288-300`): the link is no longer bearer-authorised; "the address is a claim about where to reach a person" becomes "the link opens only for the account the address names (R4, owner ruling 2026-09-29), matching the banner door".

- [ ] **Step 6: Run to see it pass**, then the whole server suite and `apps/web` (`test/invite-page.test.tsx` renders the server's message verbatim; it must still pass unchanged — the page already shows any refusal message under the Join button, `apps/web/app/invite/[token]/page.tsx:105-115`).

- [ ] **Step 7: Catalogue and commit.** `Features.md:554`: replace "an address is a claim, not an identity" wording with the R4 rule, keeping the history sentence. Commit `R4: an invitation link opens only for the account it was sent to (6.260-6.265)`.

---

### Task 5: R1 — the assignee's access extends to what inherits the assigned ticket

**Files:**
- Create: `apps/server/migrations/1790700000000_arm-reach-indexes.sql`
- Create: `apps/server/src/visibility/assignee-arm.ts`
- Modify: `apps/server/src/visibility/can-see.ts:177-206` (docblock + `currentAssignee`), `:290-297` (`canSee`)
- Modify: `apps/server/src/read/visible-where.ts:126-147` (`assigneeArmWhere`, `visibleTicketsWhere`), `:286-321` (`visibleNotesWhere`)
- Modify: `apps/server/src/visibility/can-read-note.ts:55-80` (`canReadNote`), `:99-110` (`loadNoteForVisibility`), `:118-123` (`canReadNoteById`)
- Modify: `apps/server/src/visibility/rollup.ts:283-313`; `apps/server/src/read/restricted-parents.ts:90-116`
- Modify (callers of `canReadNote`): `apps/server/src/permissions/check-permission.ts:1326`, `apps/server/src/visibility/grant-backfill.ts:483`, `apps/server/src/visibility/visible-events-for.ts:703`
- Test: `apps/server/test/visibility/assignee-visibility.test.ts` (amend 6.190, 6.191; add 6.268–6.279)
- Catalogue: `test-cases/06-auth-visibility.md` (the "assignee sees their own ticket" section, `:380`+), `Features.md:531`, `:538`

**Every reader the extension must reach (measured on `42721c48`):**

| Reader | Where | Today | After |
|---|---|---|---|
| single ticket | `canSee`, `can-see.ts:290-297` | audience OR the ticket's OWN assignee | audience OR `assigneeArmTickets(…, [ticketId])` |
| lists, board, search, attention, My Work | `visibleTicketsWhere`, `visible-where.ts:143-147` (via `assigneeArmWhere` `:130-132`) | own-assignee subquery | `assigneeReachWhere` (recursive CTE) |
| note, one | `canReadNote` inherit arm, `can-read-note.ts:76-79` | audience only (case 6.191) | audience OR attached ticket in arm reach (FD7) |
| note, list | `visibleNotesWhere` inherit arm, `visible-where.ts:303-308` | `ticketAudienceWhere` only | OR `na.ticket_id IN (reach)` |
| rollup `restrictedCount` | `rollup.ts:301-311` | `canSeeResolved` only (FD1) | OR child in arm reach |
| restricted-parent chip | `restricted-parents.ts:97-104` | `canSeeResolved` only (FD1) | OR parent in arm reach |
| sync, ticket events | `visibleEventsFor` ticket branch, `visible-events-for.ts:484` | `canSee` | unchanged code; follows `canSee` |
| sync, grant notice on `ticket.assigned` | `grantNoticeFor`, `grant-backfill.ts:349-367`, walking `audienceDependents` `:300-321` (children with `own_mode = 'inherit'`, exactly the reach shape) | admits only what `canSee` admits | unchanged code; the descendants are now admitted, so an assignee's device is told to pull them |
| sync, notes | `visible-events-for.ts:703`, `noteGrantNoticeFor` `grant-backfill.ts:483` | `canReadNote` | pass the arm reach (below) |
| notifications (mentions in notes) | `fanout.ts:262` → `canReadNoteById` | audience only | follows `canReadNoteById` |

**Interfaces:**
- Produces: `assigneeArmTickets(db: Queryable, userId: string, ticketIds: readonly string[]): Promise<Set<string>>` — of `ticketIds`, those whose inheritance chain (the ticket itself, then its parent while the ticket's `own_mode` is `'inherit'`, and so on up) contains a ticket whose CURRENT `assignee_id` is `userId`, in a project that is not deleted. It does NOT check the workspace role; every caller already holds an `EffectiveRole` and must AND `eff.workspaceRole !== null`.
- Produces: `assigneeReachWhere(userId: string, params: SqlParams, column = 'v.ticket_id'): string` — a predicate over `column` (default `v.ticket_id`; the note arm passes `na.ticket_id`) that is TRUE exactly for the tickets `assigneeArmTickets` would return. Replaces `assigneeArmWhere` (delete the old name; `git grep assigneeArmWhere` must be empty after).
- Changes: `canReadNote(eff, userId, note, attached: AttachedVisibility[], armReach: ReadonlySet<string>)` where `AttachedVisibility = ResolvedVisibility & { ticketId: string }`; `loadNoteForVisibility` returns `attached` with ticket ids.

Cases:

```markdown
- ❌ **6.268 — `assigneeArmTickets`: a ticket assigned to the user, its inheriting child and grandchild are returned; a child with its OWN audience (explicit, not naming the user) is not, nor the parent of the assigned ticket;** control: for a user assigned nothing the set is empty. Mutation: walk up without the `own_mode = 'inherit'` condition.
- ❌ **6.269 — `canSee` admits a guest to the INHERITING child and grandchild of a ticket assigned to them, and still not to its parent or sibling;** control: the child with its own explicit audience stays refused. Mutation: `canSee` calls `assigneeArmTickets` with the ticket's parent instead of the ticket.
- ❌ **6.270 — a 4-deep chain with an own-audience ticket at depth 2: the guest sees depth 1, not depth 2, and not depth 3 (which inherits from depth 2);** control: after depth 2's list is set to name the guest, depth 2 and 3 are visible by AUDIENCE. Mutation: continue the walk past a non-inherit link.
- ❌ **6.271 — reassigning the parent removes the whole inherited subtree at once, while a child assigned to the guest separately stays visible with its own inheriting children;** control: the new assignee now sees the subtree. Mutation: cache the reach set across calls.
- ❌ **6.272 — the SQL twin agrees: `listVisibleTickets` for the guest returns exactly the tickets `canSee` admits over the whole 4-deep fixture plus siblings;** control: the exact id set. Mutation: drop the recursive arm of `assigneeReachWhere`.
- ❌ **6.273 — an `inherit` note attached to a ticket assigned to the guest is readable by the guest (`canReadNote` and `visibleNotesWhere` agree);** control: a `project`-scope note attached to the same ticket stays unreadable to the guest. Mutation: pass an empty `armReach` from `loadNoteForVisibility`'s callers.
- ❌ **6.274 — an `inherit` note attached to an inheriting CHILD of the assigned ticket is readable too;** control: an `inherit` note attached only to the assigned ticket's PARENT is not. Mutation: compute `armReach` from the note's attached tickets' own assignees only.
- ❌ **6.275 — the rollup counts a child the viewer reaches by assignment (directly or by inheritance) as NOT restricted, and `restrictedParentsFor` does not mark a parent the viewer is assigned as restricted (FD1);** control: an unassigned, unlisted child is still counted restricted. Mutation: restore `canSeeResolved` alone in `rollupFor`.
- ❌ **6.276 — a REVOKED assignee reaches nothing through the extension: not the assigned ticket, not its inheriting children, not its inherit notes;** control: `proj_tickets` still names them. Mutation: drop the `eff.workspaceRole !== null` term from `canSee`'s arm.
- ❌ **6.277 — a `ticket.assigned` streamed to the new assignee is preceded by a `reach-granted` notice naming the assigned ticket AND its inheriting children;** control: a child with its own audience is not named. Mutation: remove `'ticket.assigned'` from `GRANT_BACKFILL_TRIGGERS`.
- ❌ **6.278 — a deleted project's tickets are reached by nobody through the arm, though assigned;** control: the same fixture in a live project is reached. Mutation: drop the deleted-project clause from the CTE base.
- ❌ **6.279 — the migration creates `proj_tickets_assignee_idx` on `(assignee_id)`, and `EXPLAIN` of the reach CTE for one user uses it;** control: `proj_visibility_children` (`parent_id`) is used by the recursive step. Mutation: drop the index (the EXPLAIN assertion fails).
```

Amend in place:
- **6.191** → "Amended 2026-09-29 by 6.273 (R1, owner ruling 'extend it to cover those notes and sub-tickets'): an `inherit` note attached to a ticket the guest is ASSIGNED is now readable. The case's test is rewritten as the control of 6.273's opposite: the assignee reads it; a `project`-scope note on the same ticket stays closed."
- **6.190** → its fixture's `parent` is not assigned, so its expected set is unchanged; append "Re-asserted 2026-09-29 under the recursive twin (6.272)."
- **6.188** stands (a parent is still not opened).

- [ ] **Step 1: Write the cases** and the amendments.

- [ ] **Step 2: Write the migration** `1790700000000_arm-reach-indexes.sql`:

```sql
-- Access follow-ups R1 (2026-09-29): the assignee arm now walks DOWN from every
-- ticket assigned to the viewer through inheriting children. The walk starts from
-- proj_tickets.assignee_id, which had no index; the recursive step uses the
-- existing proj_visibility_children (parent_id).
CREATE INDEX IF NOT EXISTS proj_tickets_assignee_idx ON proj_tickets (assignee_id);
```

  Run `pnpm check:migrations` (and whatever `apps/server/scripts` verifies the migration list; follow the most recent migration's commit, `1790600000000_purge-engine.sql`, for any registration it needed).

- [ ] **Step 3: Write the failing tests** in `assignee-visibility.test.ts`. Add a tree fixture beside `world()`:

```ts
/** d0 assigned to the guest; d1 inherits; d2 has its OWN explicit list (not the guest); d3 inherits from d2. */
async function tree() {
  const ws = newUlid(); const project = newUlid(); const guest = newUlid(); const other = newUlid();
  const up = newUlid(); const d0 = newUlid(); const d1 = newUlid(); const d2 = newUlid(); const d3 = newUlid();
  const sib = newUlid();
  await seedProject(db.pool, ws, project);
  await seedGuest(db.pool, ws, guest);
  await seedGuest(db.pool, ws, other);
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: up });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d0, parentId: up, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sib, parentId: up });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d1, parentId: d0 });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d2, parentId: d1 });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: d3, parentId: d2 });
  await applyAll(db.pool, [setVisibilityEnv(ws, d2, 'explicit', [other])]);
  return { ws, project, guest, other, up, d0, d1, d2, d3, sib };
}

describe('6.268–6.272 R1 — the arm reaches what inherits', () => {
  it('6.268 assigneeArmTickets walks up inherit links only; CONTROL: nobody-assigned is empty', async () => {
    const t = await tree();
    const all = [t.up, t.d0, t.d1, t.d2, t.d3, t.sib];
    expect([...(await assigneeArmTickets(db.pool, t.guest, all))].sort()).toEqual([t.d0, t.d1].sort());
    expect((await assigneeArmTickets(db.pool, t.other, all)).size).toBe(0); // control
  });

  it('6.270 stops at an own-audience ticket; CONTROL: naming the guest there opens d2 and d3 by audience', async () => {
    const t = await tree();
    expect(await canSee(db.pool, t.guest, t.d1)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.d2)).toBe(false);
    expect(await canSee(db.pool, t.guest, t.d3)).toBe(false);
    await applyAll(db.pool, [setVisibilityEnv(t.ws, t.d2, 'explicit', [t.other, t.guest])]);
    expect(await canSee(db.pool, t.guest, t.d2)).toBe(true);
    expect(await canSee(db.pool, t.guest, t.d3)).toBe(true);
  });

  it('6.272 listVisibleTickets agrees with canSee over the tree; CONTROL: the exact set', async () => {
    const t = await tree();
    const listed = (await listVisibleTickets(db.pool, t.guest, t.ws)).map((r) => r['ticket_id'] as string).sort();
    expect(listed).toEqual([t.d0, t.d1].sort());
    for (const id of [t.up, t.d0, t.d1, t.d2, t.d3, t.sib]) {
      expect(await canSee(db.pool, t.guest, id), id).toBe(listed.includes(id));
    }
  });
});
```

  Write 6.269, 6.271, 6.273–6.279 in the same file in the same style: 6.273/6.274 reuse `seedNotesFixture` exactly as 6.191 does today (its `readable` helper, asserting `{ ts, sql }` equal); 6.275 calls `rollupFor(db.pool, guest, up)` and `restrictedParentsFor`; 6.276 calls `revokeMember`; 6.277 drains `visibleEventsFor` for the guest from cursor 0 after a `ticket.assigned` via `applyCommitted` and asserts the first yielded item is `{ kind: 'reach-granted', tickets: [d0, d1 …] }` (read `test/visibility/grant-backfill*.test.ts` for the drain helper and copy it); 6.278 marks the project deleted the way 6.217's test does; 6.279 queries `pg_indexes` for the name and runs `EXPLAIN` over `SELECT … WHERE ${assigneeReachWhere(...)}`, asserting the plan text contains `proj_tickets_assignee_idx`.

- [ ] **Step 4: Run to see it fail.** `cd apps/server && pnpm exec vitest run --no-file-parallelism test/visibility/assignee-visibility.test.ts > /tmp/followups-server.log 2>&1; tail -40 /tmp/followups-server.log`. Expected: the import of `assigneeArmTickets` fails first; create an empty stub that returns `new Set()` to reach the assertions, and watch 6.268–6.279 fail on their assertions.

- [ ] **Step 5: Implement `assignee-arm.ts`:**

```ts
import type { Queryable } from '../db/queryable.js';
import type { SqlParams } from '../read/sql-params.js';

/**
 * THE ASSIGNEE ARM, EXTENDED (owner ruling 2026-09-29: "keep today's behaviour and
 * just extend it to cover those notes and sub-tickets"). The explicit list is NOT
 * written; this is a read-time reach, gone the moment the assignment moves.
 *
 * X is reached by U iff some ticket on X's INHERITANCE CHAIN — X itself, then X's
 * parent while X's `own_mode` is 'inherit', and so on up — is currently assigned
 * to U in a project that is not deleted. A ticket that authors its own audience
 * ends the chain: its subtree is judged by that audience alone.
 *
 * No workspace-role term here: every caller holds an EffectiveRole and ANDs
 * `eff.workspaceRole !== null` itself (case 6.276).
 *
 * Two spellings, pinned equal by case 6.272: this upward walk for "these ids",
 * and `assigneeReachWhere` (a downward CTE) for list reads.
 */
export async function assigneeArmTickets(db: Queryable, userId: string, ticketIds: readonly string[]): Promise<Set<string>> {
  if (ticketIds.length === 0) return new Set();
  const { rows } = await db.query<{ start_id: string }>(
    `WITH RECURSIVE chain(start_id, ticket_id, own_mode, parent_id) AS (
       SELECT v.ticket_id, v.ticket_id, v.own_mode, v.parent_id
         FROM proj_visibility v WHERE v.ticket_id = ANY ($1::text[])
       UNION
       SELECT c.start_id, p.ticket_id, p.own_mode, p.parent_id
         FROM chain c JOIN proj_visibility p ON p.ticket_id = c.parent_id
        WHERE c.own_mode = 'inherit'
     )
     SELECT DISTINCT c.start_id
       FROM chain c JOIN proj_tickets t ON t.ticket_id = c.ticket_id
      WHERE t.assignee_id = $2
        AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL)`,
    [ticketIds, userId],
  );
  return new Set(rows.map((r) => r.start_id));
}

/** The list-read twin over `v.ticket_id` (see above; case 6.272). */
export function assigneeReachWhere(userId: string, params: SqlParams, column = 'v.ticket_id'): string {
  return `${column} IN (
    WITH RECURSIVE reach(ticket_id) AS (
      SELECT t.ticket_id FROM proj_tickets t
       WHERE t.assignee_id = ${params.add(userId)}
         AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL)
      UNION
      SELECT c.ticket_id FROM proj_visibility c JOIN reach r ON c.parent_id = r.ticket_id
       WHERE c.own_mode = 'inherit'
    ) SELECT ticket_id FROM reach)`;
}
```

- [ ] **Step 6: Wire every reader** (the table above):
  1. `can-see.ts`: delete `currentAssignee`; `canSee` ends with `return eff.workspaceRole !== null && (await assigneeArmTickets(db, userId, [ticketId])).has(ticketId);`. Keep `assigneeSees` (6.187 still pins it, pure) but mark it "the single-ticket special case of `assigneeArmTickets`". Rewrite the docblock at `:177-191`: the arm now also opens inheriting notes and sub-tickets and is asked by the rollup and the restricted-parent chip (R1; FD1), so the "kept OUT of … `canReadNote`'s inherit arm, the rollup's `restrictedCount` and the restricted-parent chip" sentence is REPLACED, not appended to.
  2. `visible-where.ts`: `visibleTicketsWhere` uses `assigneeReachWhere(userId, params)` in place of `assigneeArmWhere`; delete `assigneeArmWhere`. In `visibleNotesWhere`'s inherit arm, replace `AND ${ticketAudienceWhere(eff, userId, params)}` with `AND (${ticketAudienceWhere(eff, userId, params)} OR ${assigneeReachWhere(userId, params, 'na.ticket_id')})`. Update the line comment ("the AUDIENCE, not `visibleTicketsWhere` — a note is not opened by assigning its ticket") to the R1 rule.
  3. `can-read-note.ts`: `AttachedVisibility`, `loadNoteForVisibility` pushes `{ ...v, ticketId }`; `canReadNote` takes `armReach` and its inherit arm is `attached.some((v) => canSeeResolved(eff, userId, v) || armReach.has(v.ticketId))`; `canReadNoteById` computes `armReach = await assigneeArmTickets(db, userId, loaded.attached.map((a) => a.ticketId))`. Update its docblock's inherit paragraph.
  4. The three other `canReadNote` callers compute `armReach` the same way (one `assigneeArmTickets` call on the note's attached ids) before calling.
  5. `rollup.ts`: after the loop's input rows are read, `const reach = await assigneeArmTickets(db, viewerId, rows.map((r) => r.ticket_id));` and `const visible = canSeeResolved(...) || (eff.workspaceRole !== null && reach.has(child.ticket_id));`. Add to the docblock: "the per-viewer half follows `canSee`, including the assignee arm (R1/FD1) — a child the viewer can open is not 'restricted'."
  6. `restricted-parents.ts`: the same, over `parentIds`.

- [ ] **Step 7: Run to see it pass**, then the WHOLE server suite. Expect reds only where a test pinned FD1's old behaviour (a directly-assigned child counted restricted) or 6.191's old answer; amend each in place with "Amended 2026-09-29 by 6.273/6.275 (R1)" and list them.

- [ ] **Step 8: Catalogue and commit.** `Features.md:531` (the assignee bullet): "…that one ticket, **and the notes and sub-tickets that inherit its audience** (R1, owner ruling 2026-09-29 late); the list is never written, and it all ends when the assignment moves." `Features.md:538` (rollup honesty): add "a child the viewer reaches by assignment is not counted restricted (FD1)". Commit `R1: the assignee arm extends to inheriting notes and sub-tickets; every reader agrees (6.268-6.279; 6.191 amended)`.

---

### Task 6: R5 — Remove from workspace

**Files:**
- Create: `apps/server/src/routes/members.ts`; register it in `apps/server/src/app.ts` beside `registerPeopleRoutes` (find it with `git grep -n registerPeopleRoutes apps/server/src/app.ts`), with a `PROTECTED` origin row like people's (case 6.216's shape)
- Modify: `packages/app-core/src/online/` — a `members` gateway method `remove(workspaceId, userId)`; export it
- Modify: `apps/web/app/w/[workspaceId]/members/page.tsx` — the row action (`:551-560` region) and a confirm `Dialog`
- Test: create `apps/server/test/routes/members-remove.test.ts`; modify `apps/web/test/members-page.test.tsx`
- Catalogue: `test-cases/06-auth-visibility.md` (new section "Remove from workspace (R5)"), `Features.md` §6

**Interfaces:**
- Consumes: Task 2 (`removed` names), Task 5 (the arm needs a workspace role, so removal ends it).
- Produces: `POST /v1/workspaces/:workspaceId/members/:userId/remove` → `200 { revoked: true, invitesWithdrawn: number }`, or the gate's refusal as `409 { rule, reason }`, or `404 READ_NOT_FOUND_BODY` for a non-admin caller.

Cases:

```markdown
- ❌ **6.280 — an admin removes a member: `membership.revoked` is appended as the ADMIN (attributed), the member's workspace role is null, and they can no longer open a ticket they could before;** control: another member's role is untouched. Mutation: append the revoke as the server actor.
- ❌ **6.281 — a plain MEMBER calling the route gets the shared 404 and nothing is appended;** control: the same call by the owner succeeds. Mutation: skip the admin check.
- ❌ **6.282 — removing the LAST owner is refused by the existing last-owner guard, surfaced as 409 with the guard's own reason, and nothing is appended;** control: removing a second owner by the owner succeeds. Mutation: submit through the internal door (which skips the gate).
- ❌ **6.283 — the removed person's PENDING invitations in this workspace (email matched case-insensitively to their verified email, phone matched on digits) are withdrawn with `invite.revoked` by the caller, and `invitesWithdrawn` counts them;** control: a pending invitation to someone else, and one in another workspace, are untouched. Mutation: match the email case-sensitively.
- ❌ **6.284 — the removed person's history stays: their events are all still in the ledger and their comment still renders with their name;** control: the event count for their actor id is unchanged by the removal. Mutation: (none that the product has — the route must not delete; assert the ledger count).
- ❌ **6.285 — after removal, `/actor-names` serves them with `removed: true` (Task 2), so a card they are assigned reads `Name (removed)`;** control: before removal the same read has no `removed`. Mutation: drop the former-members half (Task 2's 6.247 mutation, reached end to end).
- ❌ **6.286 — the removed person reaches nothing through the arm: not their assigned ticket, not its inheriting child (Task 5);** control: `proj_tickets` still names them. Mutation: 6.276's.
- ❌ **6.287 — the Members page shows `Remove from workspace…` on another member's row to an admin, never on the admin's own row, never on the last owner's row, and never to a non-admin;** control: the role picker still renders beside it. Mutation: render the item unconditionally.
- ❌ **6.288 — confirming the dialog calls the gateway once, the row disappears on success, and a refusal is shown in the rule's own words in the page's existing refusal region;** control: Cancel calls nothing. Mutation: close the dialog before the call resolves and swallow the refusal.
```

- [ ] **Step 1: Write the cases.**

- [ ] **Step 2: Write the failing server tests** `members-remove.test.ts`, using the same app/session helpers `people.test.ts` uses (`buildTestApp`, `signInWithEmail`, `found`, `join`, `submit`). The core one:

```ts
it('6.280 an admin removes a member, attributed; CONTROL: another member untouched', async () => {
  const owner = await byEmail(`o-${newUlid()}@example.test`);
  const ws = await found(owner);
  const admin = await byEmail(`a-${newUlid()}@example.test`);
  const gone = await byEmail(`g-${newUlid()}@example.test`);
  const stays = await byEmail(`s-${newUlid()}@example.test`);
  await join(owner, ws, admin, 'admin');
  await join(owner, ws, gone, 'member');
  await join(owner, ws, stays, 'member');

  const res = await post(admin, `/v1/workspaces/${ws}/members/${gone.userId}/remove`, {});
  expect(res.statusCode, res.body).toBe(200);
  expect(await roleOf(ws, gone.userId)).toBeNull();
  const { rows } = await db.pool.query<{ actor_id: string }>(
    `SELECT actor_id FROM events WHERE workspace_id = $1 AND type = 'membership.revoked' AND payload->>'userId' = $2`,
    [ws, gone.userId],
  );
  expect(rows).toEqual([{ actor_id: admin.userId }]);
  expect(await roleOf(ws, stays.userId)).toBe('member'); // control
});
```

- [ ] **Step 3: Run to see it fail** (404: no such route).

- [ ] **Step 4: Implement the route** in `members.ts`:
  1. Door: `requireMember` + `isWorkspaceAdmin(eff)` (`apps/server/src/read/membership-roster.ts:17`); else 404 `READ_NOT_FOUND_BODY`.
  2. Submit ONE `membership.revoked` through the GATED client door as the caller: `deps.ingest.ingestClientBatch([{ id: newUlid(), workspaceId, entity: { kind: 'membership', id: membershipId(workspaceId, userId) }, type: 'membership.revoked', version: 1, payload: { userId }, actorId: request.currentUserId, origin: 'web', clientTime: new Date().toISOString() }], request.currentUserId)`. A `refused` result → 409 `{ rule, reason }` (the last-owner guard, `packages/rule-engine/src/checks/membership.ts:9-14`, is what answers 6.282).
  3. Read the person's verified email and phone from `"user"`, then the pending invitations to them in THIS workspace: `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND status = 'pending' AND ((channel = 'email' AND lower(address) = lower($2)) OR (channel = 'phone' AND regexp_replace(address, '[^0-9]', '', 'g') = $3))`, passing `''` for an absent phone so it matches nothing. Submit one `invite.revoked` (`payload: { inviteId }`) per row through the same gated door as the caller.
  4. Reply `{ revoked: true, invitesWithdrawn }`. A docblock records: why a route (one call, the gate still decides each event, the same shape as `assign-outsider`), and that project rows are left as they are (they confer nothing once the workspace role is null, `can-see.ts` / `proj-memberships.ts:106-118`).
  5. Register the route and its `PROTECTED` row; extend 6.216's production-set test list if it enumerates routes.

- [ ] **Step 5: Run to see the server cases pass** (6.280–6.286), then the whole server suite.

- [ ] **Step 6: The client.** Invoke `ui-ux-pro-max`. In `members/page.tsx`, beside the role `Select` (`:551-557`), for `adminGate.kind === 'admin' && member.id !== currentUserId && !(member.role === 'owner' && owners === 1)`, render a quiet ghost `Button` `Remove from workspace…` (the shared `Button`, `variant="ghost"`), which opens the shared `Dialog` with the verbatim title, body and a danger `Remove` button. On confirm: call the gateway; on success drop the row from local state and show nothing else (the row going is the feedback); on refusal put `{rule, reason}` into the page's existing refusal region (`:568`+, the one role changes use). Write 6.287–6.288 in `members-page.test.tsx` with the file's existing stub services, driving the dialog by role and name.

- [ ] **Step 7: Run to see it pass** (`cd apps/web && pnpm exec vitest run --no-file-parallelism test/members-page.test.tsx > /tmp/followups-web.log 2>&1; tail -25 /tmp/followups-web.log`), then the web suite and `pnpm check:help` (if the manual describes the Members page, add one sentence there in the same commit).

- [ ] **Step 8: Catalogue and commit.** `Features.md` §6: a new ✅ bullet "**Remove from workspace** (R5, owner ruling 2026-09-29) — owner/admin, attributed `membership.revoked` through the gate (last-owner guard applies), pending invitations to them withdrawn, history kept, assigned tickets stay with a `(removed)` label; `apps/server/src/routes/members.ts`, Members page." Commit `R5: Remove from workspace (6.280-6.288)`.

---

## Before the PR

- Whole battery, LOCAL, named as local, on Node 22: `pnpm turbo run build`, `pnpm turbo run typecheck`, `pnpm turbo run test --force`, `pnpm check:citations`, `node scripts/check-case-ids.mjs`, `pnpm check:help`, `pnpm check:migrations`. Paste each exit code and `NODE=`.
- `git grep assigneeArmWhere` is empty; `git grep -n "role:" apps/server/src/routes/people.ts` finds no response role.
- The PR body lists FD1–FD7 and every amended case id.

## Self-review (against the spec)

- **Coverage:** R1 → Task 5 (A1 list untouched: nothing in Task 5 writes `visibility.*`; A2 inheritance: 6.268–6.274; A3 ends on reassign: 6.271; A4 not extended to parent/siblings: 6.269; A5 every reader: the reader table + 6.272/6.273/6.275/6.277; A6/A7: Features and docblock edits). R2 → Task 1. R3 N1 → Task 2 (6.245; FD3 for phones), N2 → Task 3 (6.255–6.257), N3 → Task 2 (6.248–6.249, FD2), N4 → Task 3 (6.254). R4 I1–I5 → Task 4 (I3 before the consume: 6.261's mutation; I4 mask: 6.264; I5 docblock). R5 M1 → 6.287, M2 → 6.280/6.284, M3 → 6.283, M4 → 6.285, M5 → 6.280/6.286, M6 out of scope (no task, by the spec).
- **Out of scope, by the spec and the directive:** S1–S4, R7, C1–C3 (fix-now batch), C2.
- **Placeholders:** none; the tests described in prose (6.269, 6.271, 6.273–6.279, 6.281–6.288) each name their fixture, the call and the assertion.
- **Names:** `assigneeArmTickets` / `assigneeReachWhere` / `AttachedVisibility` / `readActorNamesForGuest` / `addressMatchesAccount` / `maskAddress` / `actorLabelOf` are used with one spelling throughout.
