# Executor 2 — live state

**This file is executor 2's restart surface.** Executor 1's is `docs/lanes/executor-state.md` —
**never write that one.** Two writers on one file produce a conflict on every landing.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document — the dispatch
> brief, the coordination doc, this file's prose — is a fact about the moment it was written. Verify an
> anchor with `git branch --contains` (empty output = orphaned; `git cat-file` passes on reflog-only
> commits and hands you pre-rebase content while looking like it worked).

> **Never pipe a test or build run into `head`.** It orphans the vitest fork pool at `ppid=1`, ~1 core
> each, growing — measured at 22.4 GB and a forced restart on 2026-09-04. Use `| tail -N` or
> `> /tmp/x.log 2>&1` then read the file. A machine-local `PreToolUse` hook refuses the piped form.

> **This session runs on the DeepSeek backend.** Every model alias resolves to `deepseek-flash[1m]`;
> the brief's model/effort tiers are void here, but no review step is skipped because of it.

> **TOOL HAZARD — `rtk git log` IGNORES its revision argument and logs HEAD instead**, intermittently,
> and both outputs are well-formed. **Use `/usr/bin/git` for every git command whose output is evidence.**

## Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/members-inviteadmin` |
| base | `afbd361d` = `origin/main` = the `#438` merge (the anchor-holds controller commit) |
| `origin/main` | `afbd361d` |
| merge-base | `afbd361d` |
| ahead | 0 at the moment this block was written — **recount at your sha, this is a reading** |
| tree | clean at the moment this block was written |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit that carries it, so any number here names an ANCESTOR, never the tip |

## The mission

`CTL-DISPATCH-2026-09-18-exec2-members-inviteadmin` — **Members + InviteAdmin at the refreshed
prototype.** ONE PR, `--base main`, one branch per task. The owner lifted the sign-in hold on
2026-09-18 (*"4 - yes"*), which is what had both rows at verdict `held`.

Makes the ledger's `hig-per-screen/3a` and `/3b` true — **except see the scope caveat below.**

## § 1 — THE ROLE QUESTION: ANSWERED. Case 1, on the wire, dropped by the mapper.

- **On the wire:** `apps/server/src/routes/builder-reads.ts:247` selects `m.role`; `:256-260` returns
  `{ userId, displayName, role }`; typed at `packages/domain/src/read-models.ts:547`. The route
  registers no response `schema`, so nothing strips it.
- **Dropped in the client:** `packages/app-core/src/online/mappers.ts:395-410` — `mapActors` maps
  `{id, name}` only.
- **Independently corroborated in-repo:** `apps/web/src/authoring/data-source-gateway.ts:70-87`
  records the identical finding.
- **Consequence:** the ordinary case — carried end to end with a mapper test.

## § 2 — RULED 2026-09-18 (controller, cross-session message). No longer open.

The controller answered all four points and **every answer confirmed the proposal**, so nothing was
reworked:

1. **`role` carry — proceed.** On the wire, dropped by the mapper, so the ordinary case.
2. **The four unbacked columns — do NOT build, do NOT fake, name them as absences.** *"A prototype
   drawing is not a requirement."*
3. **The role `<select>` — DO NOT BUILD. Render the read-only chip.** Two reasons, the second
   deciding: it is new product capability beyond an audited screen port (a scope question that is the
   **owner's**, and the controller is putting it to them); and the missing last-owner guard means it
   would let an admin demote the sole owner — *"a security-relevant default like that should not be
   shipped by the same step that notices it."* **The controller is reporting the missing
   last-owner guard to the owner as a finding in its own right.** If it is ever built it gets its own
   task and ships **with** the guard. *"The wire could back it" is not a reason to build it.*
4. **`hig-per-screen/3a` stays `todo`.** Claim in the PR body exactly what ships, name the four
   columns as unbacked, do not claim them. *"True only for the backed surface" is not the task's
   sentence.*

The detail below is kept because it is the measurement the ruling rests on.

Full detail in `gisik-nokma-lanes/EXEC2-2026-09-18-members-wire-gaps.md`. The prototype's roster has
**five columns; the `/members` wire backs two** (name, role). `readMembers` (`builder-reads.ts:247`)
selects only `user_id`, `u."name"`, `m.role`, so these have **no field to port from** and are named
absences rather than fakes:

- **email** (`{{ m.email }}`), **Project access** (`{{ m.scopeLabel }}`), **Assigned**
  (`{{ m.assigned }}`), **Last seen** (`{{ m.seen }}`) — no such fields on this route.
- **Ticket-only access panel** + "Add to workspace" (`hasTicketOnly`, prototype `:700-718`) — no read.
- **The role `<select>`** (`canEditRole`, prototype `:679-685`) — CLOSE CALL, detailed below.

### The role select, so a restart does not re-derive it
It is **more backable than the audit implies**: `membership.granted` carries `role`
(`packages/domain/src/events/membership.ts:96`), the projection **upserts** it
(`apps/server/src/projections/proj-memberships.ts:75-76` — `ON CONFLICT … DO UPDATE SET role =
excluded.role`), and it is admin-gated (`apps/server/src/permissions/check-permission.ts:548-551`).
**Not built**, for two design reasons rather than wire reasons:
1. the select offers `Owner` (prototype `:680`) and **no ownership-transfer door exists** — the invite
   form refuses to offer `owner` for exactly that reason;
2. **no last-owner guard** on `membership.granted` exists, so it would let an admin demote the sole
   owner. The one owner-related guard found (`check-permission.ts:160-180`) is about the founding
   bypass, not demotion.

If the controller wants it, it ships **with** the owner-demotion guard. Until then the role renders as
the read-only chip.

## § 3 — SCOPE CAVEAT on the ledger rows
Four unbuildable columns mean **3a "Members — surface" is true only for the backed surface.** The
claim must say what shipped and must not assert the columns that were not drawn. Do not flip those
rows on the strength of this branch without reading § 2.

## § 4 — What is built
- `role` carried end to end: `mapActors` → the client type → `getMembers`, **with a mapper test**.
- The `Members` heading, summary line, roster table with the two backable columns (Person, Role chip).
  **The summary line's workspace name can be genuinely unavailable** — the prototype renders `ws.name`
  (data `:3032`) but that comes from `getMyWorkspaces()`, which refuses whole. The repo's handler is
  `apps/web/src/use-workspace-name.ts`, which fails silently to `null` (omission, never the id); the
  sentence must be adapted truthfully for the null case rather than printing a placeholder. The people
  and admin counts ARE derivable from the roster, and are viewer-dependent by design (an admin caller
  sees guests, a non-guest member does not — `ROSTER_VISIBLE_CLAUSE`).
- The four screen states: loading, roster-read refused, member-vs-admin split, empty.
- The `gn-members` CSS family **written from scratch** on the existing shared tokens. It is genuinely
  unstyled: 3 occurrences, all in the page, ZERO CSS rules — swept with a control (the same sweep finds
  17 `.gn-page-title` rules, so the instrument reaches CSS).
- The invite panel and its **403-derived gate are kept exactly as they are.** No second gate is added:
  `members/page.tsx:33-35` argues the door's own answer cannot drift from the door, and that argument
  holds.

## § 5 — Case ids: MY BLOCK IS `13.760`–`13.819`. NOT 13.700.

> **Corrected 2026-09-18 by controller ruling.** I had first written `13.700` here and told the
> implementer to use it. **That was wrong** — a second executor is live on the second wave and mints
> ids on its own branch, so the controller blocked the ranges to prevent a collision:
> - **`13.700`–`13.759` — executor 1's. Do NOT use.**
> - **`13.760`–`13.819` — MINE.**
>
> Anyone restarting from an older copy of this file must take the block above, not 13.700.

**Recount the next free id at your own tip before minting** — the block floor is not automatically
free. At `afbd361d` the whole block `13.760`–`13.819` measured free (swept across `test-cases/`,
`docs/`, `packages/`, `apps/`), and the max id in use anywhere is `13.699` (which closes the Extras
block `13.695`–`13.699`); `13.696`–`13.698` are free but inside that block. **`13.999` is a documented
truncation trap in file 13, not an id** (`test-cases/13-deployment-dogfooding.md:23,2406,4680,7273`).
If more than 60 ids are needed, **stop and ask** — do not run past the block.

The existing `3.129`–`3.139` ids in `apps/web/test/members-page.test.tsx` are a **different numbering
line** — leave them exactly as they are, never renumber them.

## § 6a — MEASURED: the viewport suite does NOT cover the members screen

Worth knowing before anyone spends a served web on it. The dispatch names `:3021` for viewport work, but
the suite cannot gate this change:

- `apps/web/e2e-viewport/responsive.spec.ts` mentions `members` **0 times**.
- `apps/web/e2e-viewport/accessible-names-baseline.json` has entries only for `/help`, `/privacy`,
  `/terms`, `/sign-in` and a 404 probe (`/no-such-page-e2e-viewport-probe`) — **no members entry**.
- The suite is designed for port `3021` with `reuseExistingServer: false` and **no `webServer`** block:
  it refuses the run unless something already serves there, and it *fails* rather than adopting a
  stranger if the port is occupied (`e2e-viewport/viewports.ts:30-57`).

So running it proves nothing about this screen; its only value here would be confirming I did not break
the five pages it does cover, and those are untouched (the new CSS classes are `gn-members*`, which
appear only in the members page). **Recorded as a coverage gap, not run.** The dispatch's "Report back"
list does not ask for a viewport result.

## § 6 — Rules that bind this branch
- **Never `docker compose`** (any subcommand) and **never bind `:3001`** — a peer's hot stack is there,
  mounted from executor 1's worktree. Viewport work uses **`:3021`**.
- Test runs at `--concurrency=1`. **Do not run the forced gate** — the controller does.
- **Do not edit `task-ledger.tsv`** — it is `main`'s; the controller flips rows after each merge.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` change in the **same commit** as the code.
- **Never `AskUserQuestion`** in this topology. A question for the owner is a file plus a one-line
  pointer, then a hold.
