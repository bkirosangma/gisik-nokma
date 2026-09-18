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
free. At `afbd361d` the whole block `13.760`–`13.819` measured free. If more than 60 ids are needed,
**stop and ask** — do not run past the block.

> **CORRECTION to a figure this file once carried, and to the method that produced it — and a second
> correction to the correction.** This section used to say "the max id in use is `13.699`". **That was
> WRONG.** A peer session then supplied `13.696` as the true high-water; **I measured that as wrong
> too, and am recording only what I measured myself.**
>
> **Measured 2026-09-18 at `afbd361d` (the base, before this branch minted anything):**
> - Highest case **MARKER** across every file in `test-cases/`: **`13.693`**.
> - Highest `13.*` id in `packages/` + `apps/`: **`13.689`**.
> - `13.696`–`13.699` **do not appear at all** in `test-cases/13` at base — neither as markers nor as
>   prose. So both my `13.699` and the peer's `13.696` were unverified figures, in opposite directions.
>
> **Two method traps, both of which bit during this measurement:**
> 1. **A substring sweep over a document that DISCUSSES the ids cannot separate a MINTED id from a
>    MENTIONED one.** `13.694` is prose in that file ("the next free id is `13.694`") while `13.693` is
>    a real marker — the sweep cannot tell them apart, and it fails silently in the over-estimating
>    direction. `scripts/check-case-ids.mjs` already self-tests this exact trap ("prose citation
>    excluded"); the tool knew and the hand sweep did not. **Count case MARKERS only**
>    (`^- ✅ **13.…`), never a raw substring.
> 2. **`git grep` with a pathspec of `'packages/*/test' 'apps/*/test'` returned EMPTY on a tree that
>    has hundreds of matches** — an eaten glob, the silent-empty mode. It only showed up because an
>    un-pathspec'd control fired on the same input (finding `13.686`–`13.689`). **Every sweep needs its
>    positive control through the same invocation.**
>
> Consequence for the block rule: gaps below a stale high-water are free and belong to **neither**
> block, so a wrong figure can leave a hole the next minter walks into. My own ids (`13.760`–`13.766`)
> were in-block; nothing renumbered.

**`13.999` is a documented truncation trap in file 13, not an id**
(`test-cases/13-deployment-dogfooding.md:23,2406,4680,7273`).

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
- Test runs at low concurrency — **but note `--concurrency` is NOT a vitest flag** (measured
  2026-09-18: it exits 1 with `CACError: Unknown option`). The working flag is **`--maxWorkers=1`**.
  **Do not run the forced gate** — the controller does.
- **Do not edit `task-ledger.tsv`** — it is `main`'s; the controller flips rows after each merge.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` change in the **same commit** as the code.
- **Never `AskUserQuestion`** in this topology. A question for the owner is a file plus a one-line
  pointer, then a hold.

## § 7 — REVIEW PASS AND FIX ROUND (2026-09-18)

An independent reviewer ran at the first frozen head `2ec10228` and **agreed with the commit** on both
assigned questions. It answered **Q1 (the role question) independently from the wire** and produced
better corroboration than my own: case **7.39** (`apps/server/test/routes/builder-reads.test.ts:283`)
had asserted `role` on the members response **on `main` all along**, and the column is
`NOT NULL CHECK (role IN ('owner','admin','member','guest'))` — so the field was never absent, only
unread. It confirmed Q2 string-by-string, verified the four absences are real (every hit is a docblock
comment, no fabricated markup), confirmed the CSS is token-only with no leakage, and re-measured the
suites: app-core 91/1455, web 43/451, ui 5/322, all passing.

**Two Important findings, both documentation drift this change set owns — both FIXED:**
1. **The in-app help contradicted the screen.** `docs/manual.md` and `docs/faq.md` both said the People
   page shows "no role next to each person". That is now false — there IS a Role column. Corrected in
   both sources and **regenerated** (`node scripts/help-content.mjs`; `--check` passes, 224 entries).
2. **`docs/hig-reconciliation-audit.md:186` was FALSE** and is where the wrong belief came from: it
   listed the role pill under "SHOWN BUT DOES NOT EXIST. Do not build", claiming the roster "carries no
   role field at all" — the same client-type/wire conflation the old mapper docblock made. Corrected in
   place with a dated note, and the sibling initials-circle bullet was marked partly superseded (the
   monogram is derived from `name`, which the wire does carry).

**One Minor fixed:** `initialOf` used `name.slice(0, 1)`, which **splits a surrogate pair** — measured
`'🐧 Penguin Team'` → the lone high surrogate `'\ud83d'`, which renders as U+FFFD beside a real
person's name; and `'  Kiro'` → `' '`, a blank disc. Now `Array.from(name.trimStart())[0]?.toUpperCase()
?? ''`. Case **13.762** gained two `it`s covering both, asserted against the whole character so a
"some text is there" case could not pass on the broken helper.

**One finding ESCALATED, not fixed (Minor, judgement):** the reviewer notes the `<h1>` change
`People` → `Members` cites no owner ruling, and `docs/hig-reconciliation-audit.md:194` explicitly ruled
*"Flag, never silently reword."* It was **not** silent — recorded in the commit message, the page
docblock, `Features.md` and a test docblock — and it removes a real inconsistency (`app-nav.tsx` already
said "Members"). **Flagged in the PR body for the controller/owner; the flag is the ruling's ask.**
