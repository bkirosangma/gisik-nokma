# Workspace access, assignment visibility and invites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 7 and 8 touch screens. Each of them ALSO invokes `ui-ux-pro-max` alongside its workflow skill (workspace `CLAUDE.md`, "UI/UX Design"). The design decisions that skill would make are already pinned below and applied through this repo's own tokens and components. Use the skill as a second opinion on focus, contrast and status announcements, not as a licence to restyle.

**Goal:** Five changes:
- Admins and members see every project in their workspace (rule A).
- A ticket's assignee sees that one ticket.
- A ticket born with an assignee notifies them.
- An email invitation is actually emailed.
- A person who has an account but is not in the workspace can be found by their exact email. They can then be assigned (pulled in as a guest) or invited.

**Architecture:**
- **Rule A is one change in `resolveEffectiveRole`.** Every reader of the project set follows it. No data changes, so the fifteen production members on zero projects see everything the moment it ships.
- **The assignee arm** is added once in TypeScript (`canSee`) and once in SQL (`visibleTicketsWhere`). The audience-only predicate is kept for notes, so a note is not opened by an assignment.
- **The fan-out** gains a `ticket.created` branch that reuses `handleAssigned`.
- **The invite route** sends through a new `InviteMailer` after the credential exists. A failed send is reported as `emailSent: false`, never as a 500.
- **Two new routes.**
  - `people-lookup` is an exact email match, never a list.
  - `assign-outsider` grants a guest role and submits the caller's own assignment, compensating on refusal. It is a route because the ingest door commits event by event and a check cannot see its batch.
- **The client:**
  - `app-core` gets a `PeopleGateway`, an `OutsiderFinder`, and optional props on the dialog, the flow and the sheet.
  - `apps/web` wires them in and reshapes the invite form.

**Tech Stack:**
- TypeScript monorepo (pnpm + turbo);
- Fastify + `pg` on the server (test Postgres on 54329);
- nodemailer 10 (already a server dependency);
- React 19 + Testing Library + vitest in `packages/app-core` and `apps/web`.

**Spec:** `docs/superpowers/specs/2026-09-29-workspace-access-and-invites-design.md`. It holds decisions W1–W9 and deviations D1–D6, and the owner's rulings 1–5 are quoted verbatim in its §1. Read the spec's §2, §3 and §4 before Task 1. Its §3 is the measured "what exists" every task below builds on.

## Global Constraints

- **Branch shape.**
  - Cut `task/access-and-invites` from `origin/release/trash`. One commit per task.
  - Open the PR with `bash scripts/ctl/ctl pr open task/access-and-invites --repo <worktree> --base release/trash --title T --body FILE`. Keep that command out of a compound chain.
  - Never use `--base main`. Never push to `main` or `release/trash`.
  - CI does not run on a dev PR into a release branch. The verification is your LOCAL run: say which run you quote, and paste `NODE=` beside it.
- **Node 22 for every run.** `node --version` must print `v22.*` in the same shell.
- **Build before suites.** Run `pnpm turbo run build` at the repo root before any package's vitest run. `app-core` and `apps/web` import `@gisik-nokma/domain` and `@gisik-nokma/ui` from `dist/`, so a stale build turns a change upstream into a false RED downstream (memory: suites-before-build-false-red).
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism <files> > /tmp/access-<pkg>.log 2>&1; tail -25 /tmp/access-<pkg>.log`.
  - **Never pipe a test run into `head`**, and never use `grep -m`. It orphans the worker pool (repo `CLAUDE.md`).
  - Never trust the `$?` of a chain. Read the summary line. A log with no summary line is a crash, not a pass.
  - `<pkg>` is one of `server`, `app-core`, `web`, `domain`.
- **Server suites need the test Postgres:** `docker compose up -d postgres` (port 54329). Never touch 54330, which is the dev DB.
- **Every case follows the same cycle:**
  1. RED first.
  2. A control in the same `it`.
  3. Commit.
  4. Apply the named mutation, show it red, and paste the red summary line.
  5. Restore with `git checkout -- <file>`.

  Commit BEFORE you mutate: `git checkout --` reverts to HEAD and silently destroys uncommitted work. Paste the RED and GREEN summary lines into the commit body.
- **Case ids.** The blocks below are written into each file's allocation line by Task 1 Step 1. Measured on 2026-09-29 across all 504 remote branches (`git grep` over `git branch -r`, id LINES only):
  - §3 tip `3.974`, with `3.975`–`3.981` reserved by the priority plan;
  - §6 tip `6.152`, with historic lane blocks `6.143`–`6.179` in `docs/lanes/controller-state-history.md:6000-6001` and "`6.180+` on request";
  - §7 tip `7.271`, with `7.272`–`7.276` reserved by the priority plan (`docs/superpowers/plans/2026-09-22-priority-builtin.md:20`);
  - §11 tip `11.224`.

  | File | Block | This plan uses |
  |---|---|---|
  | `test-cases/06-auth-visibility.md` | `6.180`–`6.219` | `6.180`–`6.217` |
  | `test-cases/07-api-realtime-search.md` | `7.277`–`7.286` | `7.277`–`7.279` |
  | `test-cases/11-calendar-notifications.md` | `11.225`–`11.234` | `11.225`–`11.227` |
  | `test-cases/03-foundation-ledger.md` | `3.982`–`3.999` | `3.982`–`3.999` |

  - Write each case as a `- ❌ **N — …**` id LINE at column 0, one id per line. Never put an id in a table row, a heading or backticks as the declaration: `scripts/check-case-ids.mjs` counts bullet heads only.
  - After adding a task's cases, run `node scripts/check-case-ids.mjs` and confirm the count moved by EXACTLY the number that task states.
  - Flip `❌`→`✅` in the commit that adds the citing test. Test names contain the id. `pnpm check:citations` stays green.
  - **Amending an existing case** edits its PROSE and keeps its id and its marker. Append one sentence: "Amended 2026-09-29, owner ruling (A)" or "(W3)" — then what changed and which new id pins it. Never renumber. A case whose subject no longer exists becomes `🚫` with a one-line reason, and its test is deleted in the same commit.
- **`Features.md`.** Each task appends its bullet(s) in the same commit as its code:
  - server bullets at the end of `## 6. Server core — auth, membership & visibility` (the line before `## 7. API, realtime & search`, `Features.md:565`);
  - the notification bullet as a sub-bullet under `Notification fan-out` (`:2720`);
  - UI bullets as sub-bullets under `Invite links` (`:197`), `The people page` (`:424`) and `The New ticket dialog` (`:115`).

  Where a task changes a feature described elsewhere (`Effective role resolution` `:508`, `canSee` `:523`, `Invitations — an address is a claim` `:546`), it ALSO appends a `  - ✅ …` or `  - ⚙️ …` sub-bullet under that bullet. It does not rewrite the bullet.
- **Copy.**
  - Every user-visible string this plan adds is an exported constant or a pure function. Server strings live in their module (`invites/invite-mailer.ts`, `routes/people.ts`), client strings in `packages/app-core/src/people/copy.ts` and `apps/web/src/invite-copy.ts`.
  - Tests import and pin the constant; they do not retype it. One exception: each constant is pinned LITERALLY once, by the case that introduces it.
- **Design (ui-ux-pro-max, applied through this repo's tokens and components).** One design system, no new tokens, no raw colours (`packages/ui/test/token-discipline.test.ts` scans for them).
  - **Status lines** (lookup found / not found; email sent / failed):
    - `role="status"`, not `role="alert"`: the result of an act the person just asked for, not an interruption.
    - The failed-email line is the ONE exception. It uses the existing `gn-refusal gn-refusal--transport` class and `role="alert"`, because it asks the person to do something they otherwise would not know to do.
    - Colour is never the only signal. Every state is a sentence.
  - **The outsider finder:**
    - a labelled `<input type="email">` (`.gn-field` / `.gn-field__label` / `.gn-field__input`, the invite form's own pattern);
    - a `Button` (ghost) **Find** and, once found, a `Button variant="primary"` **Assign**;
    - every control at least `2.75rem` tall (44 px);
    - Enter in the email field runs Find;
    - focus moves to **Assign** when a person is found, and stays on the field when none is.
  - **Motion:** none added.
- **CSS.** Everything this plan adds goes in ONE delimited block at the END of `apps/web/app/globals.css`, opened by `/* ══ access-and-invites: begin ══` and closed by `/* ══ access-and-invites: end ══ */` (Task 7 opens it). PR #738 (editor-skin) and the trash plans also append to this file. Before opening the PR, run `git fetch origin && git merge origin/release/trash` and resolve a `globals.css` conflict by keeping both sides.
- **Help corpus.**
  - `docs/manual.md` and `docs/faq.md` generate `packages/app-core/src/help/content.generated.ts`. `pnpm check:help` refuses a stale copy, and it compares every double-quoted span in the two documents against the product, ratcheted by `scripts/help-quoted-strings-absent.json`.
  - Task 9 edits both documents, runs `pnpm help:generate`, then `pnpm check:help`, and commits the regenerated module.
  - **Quote nothing new with double quotes** unless the exact string is a product constant. Use **bold** for labels.
  - If `check:help` reports a span the documents quote that the product no longer contains, fix the DOCUMENT. Never add the span to the baseline.
- **`check:env`.** Task 5 adds `INVITE_FROM`, which must be documented in `.env.example` in the same commit (`scripts/check-env-example.mjs`, `pnpm check:env`).
- **Never `AskUserQuestion`.** A question goes into your progress line for the controller.
- **Line numbers** in this plan were read at `origin/release/trash` `cd6300ee`. Open the file; trust the symbol, not the number.

## Recorded deviations from the spec and the brief

- **D1 — the owner is in rule A's set.**
  - The brief says "Owner unchanged".
  - Reads are unchanged, because the owner already reads everything (`can-see.ts:125-126`).
  - Writes change. `checkVisibilityPermission`'s `ticket.created` arm refuses any actor not in the project set (`check-permission.ts:1367`), and it has no owner exemption. Compare the `note.created` home check at `:1313`, which has one. So an owner whom nobody put on a project cannot create a ticket in it today. Rule A without the owner would let an admin do what the owner cannot. Case 6.182.
- **D2 — the invite form's project select is removed** (the brief's recommendation). `projectIds` stays accepted by the route (`invites.ts:313`) and the schema (`events/invites.ts:117`), so old events replay and an API caller can still write explicit rows.
- **D3 — one lookup route, gated on MEMBERSHIP, serves both the pickers and the invite form.** The coordinator's design allowed an admin gate for the invite dialog. The invite form is drawn only for owners and admins (`members/page.tsx` `adminGate`), so a second, admin-gated route would be a second answer to one question.
- **D4 — the invitation email is plain text only.** The brief said "plain text + minimal HTML". The link IS the credential, and the magic-link sender's reason for plain text applies word for word (`auth/smtp-magic-link-sender.ts:89-95`). Case 6.195 pins "no `text/html` part".
- **D5 — the outsider grant is a server route, not two events in one batch.**
  - `ingestAll` commits event by event (`ingest-service.ts:432-446`, `commitOne` at `:445`), and a check sees only its own event.
  - The route pre-flights the common refusal before granting anything. Case 6.211.
  - It compensates a refusal that happens after the grant with `membership.revoked`. Case 6.212.
- **D6 — the assignee arm in SQL is `EXISTS (… proj_tickets asg WHERE asg.ticket_id = v.ticket_id AND asg.assignee_id = $n)`**, not `t.assignee_id = $viewer`. `listVisibleTickets` selects from `proj_visibility v` alone (`visible-tickets.ts:56-80`; `visible-where.ts:141-146`).
- **D7 — `NOT_ON_PROJECT_REASON` becomes unreachable, and the arm stays.**
  - Under rule A, every role that can reach `check-permission.ts:1367` is in the project set for every founded project. That is owner, admin and member. A guest is refused earlier with `GUESTS_CANNOT_CREATE_REASON`, and `checkProjectExists` refuses an unfounded project before this arm.
  - The arm is kept as the door's statement of the rule, and its cases are amended (Task 2).
  - **It is recorded for the owner as a check that can no longer fail.** It would come back to life for a future role that is neither in `RULE_A_ROLES` nor refused earlier.
- **D8 — the pickers find outsiders by an exact email (owner ruling 5)**, and the "Not in this workspace" divider list from the coordinator's first design is dropped with it. `Select` has no section support (`packages/ui/src/select/select.tsx:16`), and nothing now needs it.
- **D9 — the lookup is charged to the INVITE rate-limit bucket** (`app.ts:631-638`), because it answers "does this address have an account", and is added to `HTTP_ORIGIN_PROTECTED_ROUTES` (`http/http-origin.ts:157-206`). It is a cookie-authenticated POST, and the drift guard 13.116 requires a row for it.
- **D10 — the members page result card is keyed on the CHANNEL the invitation was minted with**, which the page now holds beside the minted link. For the phone channel it says nothing about email. `emailSent` is only meaningful for email.
- **D11 — the reopen path is left on the plain door.** `CreateTicketFlow`'s `acceptReopen` (`create-ticket-flow.tsx:399-…`) sends the child claim through `dataSource`, not the outsider door. An outsider birth assignee on a child of a CLOSED parent therefore gets the named-person refusal after the reopen, and the person picks them again. Recorded, not built (Task 7).

## Review Focus

Inputs and conditions the spec implies and no happy path exercises, most likely first. Each has its test in the owning task.

1. **A guest assignee sees exactly one ticket.** A guest assigned a project-mode ticket sees it in the sheet (`canSee`), My Work and the inbox. They do not see its sibling or its parent, and the project name does not reach them. Task 3 (6.188, 7.277, 7.279), Task 4 (11.225). *Not pinned, and recorded:* the board route (`routes/board.ts:390-394`) gates on workspace membership, not on the project list, so a guest who types a board URL gets that one card — the same as a guest with an explicit ticket gets today.
2. **Unassigning takes it back.** Reassigning or clearing the assignee removes the ticket from the former guest assignee's My Work and `canSee` at once. Task 3 (6.189, 7.278).
3. **The production shape, with no data change.** A member who joined through an "All projects" invitation (a workspace grant and zero roster rows) sees every live project and its project-mode tickets, and no event is appended to make it so. Task 1 (6.184).
4. **A deleted project stays hidden under rule A.** A member on no roster row does not get a trash-Plan-1-deleted project in `visibleProjects` or in their project set, and cannot reach its ticket through `canSee` (the ticket-history, attachment, reconcile and stream doors). An explicit member keeps exactly today's answer. Task 1 (6.183, 6.186, 6.217).
5. **An SMTP failure is never a 500.** A throwing mailer gives 201 with `emailSent: false` and the link, the alerter is told, and the link still opens. Task 5 (6.200).
6. **A member (not an admin) pulls an outsider in.** A guest is granted and the ticket assigned. The same member's stand-alone `membership.granted` is still refused. Task 6 (6.208, 6.209).
7. **The outsider sees nothing else.** After being pulled in, they see the assigned ticket and not its sibling. Task 6 (6.208).
8. **The lookup is exact.** A partial email returns nothing. A match returns only `userId, name, email, inWorkspace, role`. Someone already in the workspace comes back as `inWorkspace: true` and is never re-granted by the outsider door. Task 6 (6.203, 6.204, 6.206, 6.214).
9. **Picking an existing account sends the invite to that account's email.** Someone already in the workspace is shown as a member, not offered as new. Task 8 (3.995, 3.996).

---

## File map

| File | Responsibility in this plan |
|---|---|
| `apps/server/src/permissions/effective-role.ts` | `RULE_A_ROLES`; the implicit project rows, explicit rows overwriting |
| `apps/server/src/visibility/can-see.ts` | `assigneeSees`; `canSee`'s assignee arm; the docblock table |
| `apps/server/src/read/visible-where.ts` | `ticketAudienceWhere` (the old body), `assigneeArmWhere`, `visibleTicketsWhere` = audience OR assignee; notes' inherit arm on the audience predicate |
| `apps/server/src/read/visible-projects.ts`, `visibility/can-read-note.ts`, `routes/my-work.ts` | docblocks that argued the old rule |
| `apps/server/src/visibility/grant-backfill.ts` | `ticket.assigned` joins `GRANT_BACKFILL_TRIGGERS` |
| `apps/server/src/notifications/fanout.ts` | the `ticket.created` branch |
| `apps/server/src/config.ts`, `.env.example` | `INVITE_FROM` → `inviteFrom` |
| `apps/server/src/invites/invite-mailer.ts` (new) | `composeInviteEmail`, `InviteMailer`, `LogInviteMailer`, `SmtpInviteMailer`, `selectInviteMailer` |
| `apps/server/src/routes/invites.ts` | send after the credential exists; `emailSent` |
| `apps/server/src/routes/people.ts` (new) | `POST …/people-lookup`, `POST …/assign-outsider` |
| `apps/server/src/app.ts`, `src/index.ts`, `src/http/http-origin.ts` | wiring, the limiter bucket, CSRF set |
| `packages/app-core/src/online/invites-admin.ts` | `MintedInvite.emailSent` |
| `packages/app-core/src/online/people.ts` (new) | `PeopleGateway`, `createHttpPeopleGateway` |
| `packages/app-core/src/people/copy.ts` (new) | the finder's strings |
| `packages/app-core/src/views/outsider-finder.tsx` (new) | `OutsiderFinder` |
| `packages/app-core/src/views/new-ticket-dialog.tsx`, `create-ticket-flow.tsx`, `ticket-sheet.tsx` | the outsider arm |
| `packages/app-core/src/index.ts` | exports |
| `apps/web/src/providers.tsx`, `apps/web/test/helpers/stub-services.ts` | `AppServices.people` |
| `apps/web/src/people-props.ts` (new) | `peopleProps(people, workspaceId)` |
| `apps/web/src/invite-copy.ts` (new) | the invite form's new strings |
| `apps/web/app/w/[workspaceId]/members/page.tsx` | no project select; the lookup line; the result card; the button label |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/app/w/[workspaceId]/my-work/page.tsx`, `apps/web/src/notes/note-document.tsx` | pass `peopleProps` to the flow and the sheets |
| `apps/web/app/globals.css` (EOF block) | the finder's layout |
| `docs/manual.md`, `docs/faq.md`, `packages/app-core/src/help/content.generated.ts` | the help corpus |
| `test-cases/03-…`, `06-…`, `07-…`, `11-…`, `13-second-wave-roles-and-navigation.md`, `Features.md` | cases and the feature catalogue |

Tests (new unless stated):
- `apps/server/test/permissions/rule-a.test.ts`
- `apps/server/test/visibility/assignee-visibility.test.ts`
- `apps/server/test/notifications/fanout.test.ts` (existing — one describe appended)
- `apps/server/test/invites/invite-mailer.test.ts`
- `apps/server/test/routes/invites-email.test.ts`
- `apps/server/test/config.test.ts` (existing — the exact-shape object and one `it`)
- `apps/server/test/routes/people.test.ts`
- `apps/server/test/http/security-middleware.test.ts` (existing — two `PROTECTED` rows)
- `apps/server/test/routes/my-work.test.ts` (existing — amended cases plus 7.277–7.279)
- `packages/app-core/test/online/people.test.ts`
- `packages/app-core/test/views/outsider-finder.test.tsx`
- `packages/app-core/test/views/outsider-assign.test.tsx`
- `apps/web/test/members-page.test.tsx` (existing)
- `apps/web/test/people-props.test.ts`
- `apps/web/test/access-css.test.ts`

---

### Task 1: Rule A — admins, members and the owner are on every project of their workspace

**Files:**
- Modify: `apps/server/src/permissions/effective-role.ts`:
  - after the imports (`:1-2`), add `RULE_A_ROLES`;
  - the body of `resolveEffectiveRole` after the null early return (`:139-147`);
  - the docblocks at `:81-99` and `:150-161`.
- Modify: the docblocks at `apps/server/src/visibility/can-see.ts:29-34`, `:50-55`; `apps/server/src/read/visible-where.ts:37-42`, `:55`; `apps/server/src/read/visible-projects.ts:41-85`; `apps/server/src/visibility/can-read-note.ts:68-69`. The code in these four files is untouched.
- Create: `apps/server/test/permissions/rule-a.test.ts`.
- Modify: `test-cases/06-auth-visibility.md`, `test-cases/07-api-realtime-search.md`, `test-cases/11-calendar-notifications.md`, `test-cases/03-foundation-ledger.md` (block lines), `Features.md`.

**Interfaces:**
- Produces:
  - `export const RULE_A_ROLES: ReadonlySet<WorkspaceRole>` = `{'owner','admin','member'}`.
  - `resolveEffectiveRole`'s return is unchanged in type. For a role in `RULE_A_ROLES`, `projects` now also holds every LIVE (`deleted_at IS NULL`) `proj_projects` row of the workspace as `{ projectAdmin: false }`, and explicit roster rows overwrite them. A deleted project reaches the set only through an explicit roster row, exactly as before.
- Consumes: nothing new.

Cases. Guard count +8 (6.180–6.186 and 6.217, the block's next free id after Task 6's). Step 1 also writes the four block lines, which are not id lines.

```markdown
- ❌ **6.180 — rule A: a workspace ADMIN and a plain MEMBER, each on no project, see a project-mode ticket in a FOUNDED project (`canSee`), and a GUEST does not;** control: the same guest named on an explicit ticket sees that one. Mutation: remove `'admin'` from `RULE_A_ROLES` — the admin arm reddens and the member arm does not.
- ❌ **6.181 — rule A merges, it does not overwrite: a member with an explicit `projectAdmin: true` row keeps project-admin rights on that project (`hasProjectAdminRights`), and holds none on another founded project they reach only by rule A;** control: that other project IS in their project set. Mutation: apply the explicit rows BEFORE the implicit ones.
- ❌ **6.182 — D1: the workspace OWNER, on no project, may create a ticket in a project an admin founded (the gate answers `null`);** control: a guest is still refused with `GUESTS_CANNOT_CREATE_REASON`. Mutation: remove `'owner'` from `RULE_A_ROLES` — the gate answers `NOT_ON_PROJECT_REASON`.
- ❌ **6.183 — a member on no project gets every LIVE project in `visibleProjects`, and a project trash Plan 1 deleted is NOT in their project set;** control: the owner's list omits the deleted one too. Mutation: delete the `if (row.deleted_at !== null) continue;` line in `visibleProjects` (the OWNER arm reddens: the owner's list is read before any set).
- ❌ **6.184 — W2, no repair: a member granted the workspace with NO roster rows (the shape all 15 production members are in) sees every founded project and its project-mode tickets, and resolving them appends nothing to `events`;** control: `proj_memberships` holds no project row for them before and after. Mutation: make `resolveEffectiveRole` return before the `proj_projects` read (the pre-rule-A body).
- ❌ **6.185 — a GUEST's project set stays exactly its explicit rows, even with a founded project beside it;** control: a member in the same workspace gets the founded project. Mutation: add `'guest'` to `RULE_A_ROLES`.
- ❌ **6.186 — a deleted project's tickets stay out of a `LIVE_TICKET_WHERE` list for an EXPLICIT member of that project, whose `canSee` still answers true (the pre-rule-A behaviour, unchanged);** control: a live project's ticket is in the same list. Mutation: drop `LIVE_TICKET_WHERE` from the test's list query — the deleted ticket appears, proving the conjunct is what hides it from an explicit member.
- ❌ **6.217 — rule A does not reach a DELETED project: a member NOT on it cannot see its ticket through `canSee` — the function every canSee-only door asks (ticket history `routes/ticket-history.ts:281`, attachments, reconcile, the stream) — and the project is not in their set;** control: an EXPLICIT member of the same deleted project still sees it, exactly as before rule A. Mutation: drop `AND deleted_at IS NULL` from rule A's `proj_projects` read.
```

- [ ] **Step 1: Write the block lines and the cases.**
  - Append this prose paragraph (not an id line) at the end of `test-cases/06-auth-visibility.md`:

    ```markdown
    **Block `6.180`–`6.219` is ALLOCATED to the access-and-invites plan (`docs/superpowers/plans/2026-09-29-workspace-access-and-invites.md`, 2026-09-29).** Measured across all remote branches: §6's tip is `6.152`; `6.143`–`6.179` are historic lane blocks (`docs/lanes/controller-state-history.md:6000-6001`) and are not entered. `6.218`–`6.219` are reserved and unused.
    ```

  - Write the same shape of line at the end of `test-cases/07-api-realtime-search.md` (`7.277`–`7.286`; the tip is `7.271`, and `7.272`–`7.276` are the priority plan's reservation), `test-cases/11-calendar-notifications.md` (`11.225`–`11.234`; the tip is `11.224`) and `test-cases/03-foundation-ledger.md` (`3.982`–`3.999`; the tip is `3.974`, and `3.975`–`3.981` are the priority plan's reservation).
  - Then add the seven cases above under a new `## Rule A — admins and members are on every project (access plan, 2026-09-29)` at the end of `06-auth-visibility.md`.
  - Run `node scripts/check-case-ids.mjs` before and after. Expected: +8.

- [ ] **Step 2: Write the failing test** `apps/server/test/permissions/rule-a.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope } from '@gisik-nokma/domain';
import {
  checkPermission,
  GUESTS_CANNOT_CREATE_REASON,
  PERMISSION_ROLE_RULE,
} from '../../src/permissions/check-permission.js';
import { hasProjectAdminRights, resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleProjects } from '../../src/read/visible-projects.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../../src/read/visible-where.js';
import { canSee } from '../../src/visibility/can-see.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import {
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Access plan Task 1 — rule A (owner ruling 2026-09-29: "admins and members see
 * every project in their workspace by default"), cases 6.180–6.186 and 6.217.
 *
 * EVERY project here is FOUNDED with `seedProject` first. Rule A reads
 * `proj_projects`, and `seedTicket`/`seedMember` found nothing on their own
 * (`test/helpers/seed.ts:95-103`), so a fixture that skipped the founding
 * would pass the OLD rule and the new one alike and its mutation would be
 * vacuous.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

async function world() {
  const ws = newUlid();
  const owner = newUlid();
  const admin = newUlid();
  const member = newUlid();
  const guest = newUlid();
  const project = newUlid();
  const ticket = newUlid();
  await seedMember(db.pool, ws, owner, 'owner');
  await seedMember(db.pool, ws, admin, 'admin');
  await seedMember(db.pool, ws, member, 'member');
  await seedGuest(db.pool, ws, guest);
  await seedProject(db.pool, ws, project);
  // Born in project mode — the root default (`proj-visibility.ts:103`).
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: ticket });
  return { ws, owner, admin, member, guest, project, ticket };
}

function createTicket(ws: string, projectId: string, actorId: string): EventEnvelope {
  return testEnvelope({
    workspaceId: ws,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'Count the float' },
    actorId,
  });
}

async function eventCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
  return rows[0]!.n;
}

describe('6.180 rule A: admins and members see project-mode work in every founded project', () => {
  it('6.180 admin and member on no project see it; a guest does not; CONTROL: the guest sees an explicit ticket naming them', async () => {
    const w = await world();
    expect(await canSee(db.pool, w.admin, w.ticket)).toBe(true);
    expect(await canSee(db.pool, w.member, w.ticket)).toBe(true);
    expect(await canSee(db.pool, w.guest, w.ticket)).toBe(false);

    const named = newUlid();
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: w.project, ticketId: named });
    await applyAll(db.pool, [setVisibilityEnv(w.ws, named, 'explicit', [w.guest])]);
    expect(await canSee(db.pool, w.guest, named)).toBe(true);
  });
});

describe('6.181 rule A merges: an explicit projectAdmin flag survives', () => {
  it('6.181 project admin on their own project, not on the rule-A one; CONTROL: the rule-A one is in the set', async () => {
    const w = await world();
    const lead = newUlid();
    const other = newUlid();
    await seedProject(db.pool, w.ws, other);
    await seedMember(db.pool, w.ws, lead, 'member', [{ projectId: w.project, projectAdmin: true }]);

    const eff = await resolveEffectiveRole(db.pool, lead, w.ws);
    expect(hasProjectAdminRights(eff, w.project)).toBe(true);
    expect(hasProjectAdminRights(eff, other)).toBe(false);
    expect(eff.projects.get(other)).toEqual({ projectAdmin: false });
  });
});

describe('6.182 D1: the owner may create a ticket in a project nobody put them on', () => {
  it('6.182 the gate answers null for the owner; CONTROL: a guest is still refused', async () => {
    const w = await world();
    const gate = (env: EventEnvelope, userId: string) => checkPermission(env, { db: db.pool, sessionUserId: userId });
    expect(await gate(createTicket(w.ws, w.project, w.owner), w.owner)).toBeNull();
    expect(await gate(createTicket(w.ws, w.project, w.guest), w.guest)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: GUESTS_CANNOT_CREATE_REASON,
    });
  });
});

async function deleteProject(ws: string, projectId: string, actorId: string): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: ws, actorId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} }),
  ]);
}

describe('6.183 visibleProjects under rule A keeps trash Plan 1 containment', () => {
  it('6.183 a member gets every live project and not the deleted one; CONTROL: the owner omits it too', async () => {
    const w = await world();
    const gone = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await deleteProject(w.ws, gone, w.owner);

    const eff = await resolveEffectiveRole(db.pool, w.member, w.ws);
    expect(eff.projects.has(gone)).toBe(false);
    expect((await visibleProjects(db.pool, eff, w.ws)).map((p) => p.projectId)).toEqual([w.project]);

    const ownerEff = await resolveEffectiveRole(db.pool, w.owner, w.ws);
    expect((await visibleProjects(db.pool, ownerEff, w.ws)).map((p) => p.projectId)).toEqual([w.project]);
  });
});

describe('6.184 W2: no repair — the production shape sees everything', () => {
  it('6.184 a workspace grant with zero roster rows sees every founded project, and resolving appends nothing', async () => {
    const w = await world();
    const second = newUlid();
    const secondTicket = newUlid();
    await seedProject(db.pool, w.ws, second);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: second, ticketId: secondTicket });

    const rosterRows = async () =>
      (
        await db.pool.query(
          `SELECT project_id FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project'`,
          [w.ws, w.member],
        )
      ).rows;
    expect(await rosterRows()).toEqual([]);

    const before = await eventCount();
    const eff = await resolveEffectiveRole(db.pool, w.member, w.ws);
    expect((await visibleProjects(db.pool, eff, w.ws)).map((p) => p.projectId).sort()).toEqual(
      [w.project, second].sort(),
    );
    expect(await canSee(db.pool, w.member, secondTicket)).toBe(true);
    expect(await eventCount()).toBe(before);
    expect(await rosterRows()).toEqual([]);
  });
});

describe('6.185 a guest is not on a project by rule A', () => {
  it('6.185 the guest set is empty beside a founded project; CONTROL: the member set has it', async () => {
    const w = await world();
    expect([...(await resolveEffectiveRole(db.pool, w.guest, w.ws)).projects.keys()]).toEqual([]);
    expect([...(await resolveEffectiveRole(db.pool, w.member, w.ws)).projects.keys()]).toEqual([w.project]);
  });
});

describe('6.186 a deleted project’s tickets stay out of a live list for its explicit member', () => {
  it('6.186 LIVE_TICKET_WHERE drops it though canSee answers true; CONTROL: the live project’s ticket is listed', async () => {
    const w = await world();
    const gone = newUlid();
    const goneTicket = newUlid();
    const insider = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await seedMember(db.pool, w.ws, insider, 'member', [{ projectId: gone }]);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: gone, ticketId: goneTicket });
    await deleteProject(w.ws, gone, w.owner);

    const eff = await resolveEffectiveRole(db.pool, insider, w.ws);
    const params = new SqlParams();
    const { rows } = await db.pool.query<{ ticket_id: string }>(
      `SELECT t.ticket_id FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${params.add(w.ws)} AND ${visibleTicketsWhere(eff, insider, params)}
          AND ${LIVE_TICKET_WHERE}
        ORDER BY t.ticket_id`,
      params.toArray(),
    );
    expect(rows.map((r) => r.ticket_id)).toEqual([w.ticket]);
    // The explicit member's canSee is the pre-rule-A answer, unchanged: the
    // containment gap trash Plan 1 left for explicit members is not closed here.
    expect(await canSee(db.pool, insider, goneTicket)).toBe(true);
  });
});

describe('6.217 rule A does not reach a deleted project (coordinator amendment, 2026-09-29)', () => {
  /**
   * `canSee` is the whole of the question the canSee-only doors ask — ticket
   * history (`routes/ticket-history.ts:281`), attachments, reconcile and the
   * stream all call it and nothing else about deletion — so it is tested here
   * directly rather than through one route. Without the `deleted_at IS NULL`
   * filter every admin and member would reach a deleted project's tickets
   * through those doors; with it, only the people explicitly on the project do,
   * exactly as before rule A.
   */
  it('6.217 a member NOT on the deleted project cannot see its ticket; CONTROL: an explicit member still can', async () => {
    const w = await world();
    const gone = newUlid();
    const goneTicket = newUlid();
    const insider = newUlid();
    await seedProject(db.pool, w.ws, gone);
    await seedMember(db.pool, w.ws, insider, 'member', [{ projectId: gone }]);
    await seedTicket(db.pool, { workspaceId: w.ws, projectId: gone, ticketId: goneTicket });
    // Visible to the member BEFORE the delete, through rule A — so the `false`
    // below is the filter, not a fixture that never worked.
    expect(await canSee(db.pool, w.member, goneTicket)).toBe(true);
    await deleteProject(w.ws, gone, w.owner);

    expect((await resolveEffectiveRole(db.pool, w.member, w.ws)).projects.has(gone)).toBe(false);
    expect(await canSee(db.pool, w.member, goneTicket)).toBe(false);
    expect(await canSee(db.pool, w.admin, goneTicket)).toBe(false);
    expect(await canSee(db.pool, insider, goneTicket)).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and watch it fail.**
  - Run `pnpm turbo run build`, then `docker compose up -d postgres`, then `cd apps/server && pnpm exec vitest run --no-file-parallelism test/permissions/rule-a.test.ts > /tmp/access-server.log 2>&1; tail -25 /tmp/access-server.log`.
  - Expected: 6.180, 6.181, 6.182, 6.184 and 6.217 FAIL, each on its first rule-A assertion (6.217 on its pre-delete `true`).
  - 6.183 and 6.186 PASS already: with no rule A, the member's set does not hold the deleted project and the explicit member's answers are today's. Their mutations are the witness. Say so in the commit body.
  - 6.185 PASSES already: a guest has no rule-A set today. It has no RED, so its mutation is the witness. Say so in the commit body.

- [ ] **Step 4: Implement.** In `apps/server/src/permissions/effective-role.ts`, add below the imports:

```ts
/**
 * The workspace roles that are ON EVERY PROJECT of their workspace — rule A
 * (owner ruling 2026-09-29: "admins and members see every project in their
 * workspace by default"; access plan W1).
 *
 * The OWNER is here by deviation D1: owner reads were already total
 * (`canSeeResolved`'s owner arm), but the `ticket.created` door asks the project
 * set and has no owner exemption (`check-permission.ts:1367`), so without this
 * an admin could create where the owner could not. A GUEST is not here: a guest
 * reaches work through explicit lists and assignment (W3), never a project.
 *
 * NO DATA IS WRITTEN. The set is read from `proj_projects` on every resolve, so
 * a member who joined with zero roster rows — all fifteen in production on
 * 2026-09-29 — is on every project the moment this ships (W2, case 6.184).
 */
export const RULE_A_ROLES: ReadonlySet<WorkspaceRole> = new Set<WorkspaceRole>(['owner', 'admin', 'member']);
```

  Replace the final `return { [RESOLVED]: true, workspaceRole, projects };` (`:147`) with:

```ts
  if (!RULE_A_ROLES.has(workspaceRole)) {
    return { [RESOLVED]: true, workspaceRole, projects };
  }
  // Rule A. Every founded, LIVE project of the workspace. A DELETED project is
  // excluded (coordinator amendment 2026-09-29, case 6.217): the doors that ask
  // `canSee` alone — ticket history, attachments, reconcile, the stream — have
  // no deletion predicate, so including it would widen trash Plan 1's
  // containment gap from "the project's explicit members" to "every admin and
  // member". Explicit roster rows below are untouched, so an explicit member of
  // a deleted project keeps exactly the pre-rule-A answer (case 6.186).
  //
  // IMPLICIT FIRST, EXPLICIT SECOND, and the order is load-bearing: an explicit
  // roster row carries `projectAdmin`, and writing the implicit `false` after it
  // would strip a project admin of their rights (case 6.181).
  const { rows: founded } = await db.query<{ project_id: string }>(
    'SELECT project_id FROM proj_projects WHERE workspace_id = $1 AND deleted_at IS NULL',
    [workspaceId],
  );
  const everyProject = new Map<string, { projectAdmin: boolean }>();
  for (const row of founded) everyProject.set(row.project_id, { projectAdmin: false });
  for (const [projectId, flag] of projects) everyProject.set(projectId, flag);
  return { [RESOLVED]: true, workspaceRole, projects: everyProject };
```

  **Docblocks.** Rewrite each of these so it states rule A and no longer argues the old rule. Keep each block's other paragraphs.
  - `effective-role.ts`'s "The role rules" (`:81-85`): "A user's workspace role is their workspace-scope row's role, or null. Their project set is every project-scope row, with that row's project-admin flag, plus — for `RULE_A_ROLES` — every founded project of the workspace with the flag off."
  - `hasProjectAdminRights`'s "This is NOT a read bypass" paragraph (`:158-160`): "Reading is `canSee`'s question. Since rule A (2026-09-29) an owner, admin or member reads every project's project-mode tickets through the project set, not through this function."
  - `can-see.ts`:
    - the table row `| member / admin | yes | only if on project | only if listed |` becomes `| member / admin | yes | yes (rule A: on every project) | only if listed |`;
    - the paragraph `:50-55` becomes: "**Admins and members are on every project (rule A, owner ruling 2026-09-29).** `resolveEffectiveRole` puts every founded project in their set, so the `project` arm below answers true for them; the arm still asks the set, because a guest's set is explicit rows only and a revoked member's is empty. An unlisted admin still does not see an explicit-mode ticket.";
    - the inline comment at `:135` (`// No admin bypass — deliberate, see the docblock.`) becomes `// Rule A fills the set for owner/admin/member — see the docblock.`
  - `visible-where.ts`: the same table row at `:41`, and `:55` (`**Admins get no bypass.** …`) becomes "**Admins share the member branch**, and since rule A both are on every founded project through `eff.projects`."
  - `visible-projects.ts:41-85`: keep the headings. Replace the second bullet (`:53-59`) with "every other role reads `eff.projects`, which rule A fills with every founded project for an admin or member, and which is a guest's explicit rows only." Replace the "partial workspace" paragraph (`:61-67`) with "A GUEST outside project Y is told nothing about Y here. An admin or member is on every project (rule A), so for them this list is the whole live workspace."
  - `can-read-note.ts:68-69`: `// Membership, NOT role — and since rule A an owner/admin/member is on every founded project; a guest never.`

- [ ] **Step 5: Run it and watch it pass.** Same command. Expected: 7 passed. Then run the WHOLE server suite (`cd apps/server && pnpm exec vitest run --no-file-parallelism > /tmp/access-server.log 2>&1; tail -40 /tmp/access-server.log`). **It will be red.** Those reds are Task 2's input: copy the failing test names into your progress line. Do not fix them in this commit.

- [ ] **Step 6: Flip 6.180–6.186 and 6.217 to ✅. Features.md:**
  - under `Effective role resolution` (`Features.md:508`) append:

    ```markdown
      - ⚙️ **Rule A — owners, admins and members are on every project of their workspace** (owner ruling 2026-09-29; access plan Task 1; `apps/server/src/permissions/effective-role.ts` `RULE_A_ROLES`) — the project set gains every founded project (`proj_projects`) with `projectAdmin: false`, explicit roster rows applied after so a project admin keeps their flag. Read-time, no data written: the members who joined through "All projects" invitations with zero roster rows see everything with no migration. Guests are unchanged. A DELETED project is not added (the canSee-only doors carry no deletion predicate), so only its explicit members keep reaching it, as before rule A. Cases 6.180–6.186, 6.217.
    ```

  - under `canSee — the one visibility decision` (`:523`) append:

    ```markdown
      - ⚙️ **Rule A reaches `canSee` through the project set, and the admin-no-bypass rule is retired** (2026-09-29) — an admin or member now reads every project-mode ticket; an unlisted admin still does not read an explicit one. Case 6.180.
    ```

- [ ] **Step 7: Commit** as `Access 1: rule A — owner/admin/member on every project (6.180-6.186)`. The body must say the full server suite is RED by design until Task 2, and must list the red test names. Then work through the mutations.

---

### Task 2: Amend every test that pinned the old rule

This task changes no product code. It changes the tests and cases that asserted "an admin or member off a project does not see it", or "cannot create in it". It also fixes the fixtures that pass under BOTH rules for the wrong reason.

**Files:**
- Modify (measured by grep on `cd6300ee`, NOT by a run — Task 1 Step 5's red list is the authority, and this list is where to look first). Files whose tests use an off-project admin, an `outsider` member, "no bypass" or `NOT_ON_PROJECT_REASON` (`/usr/bin/grep -rlE "outsider|no (read )?bypass|not on (the|its|that) project|on no project|NOT_ON_PROJECT_REASON" apps/server/test`):
  - `test/helpers/read-scenario.test.ts`
  - `test/integration/fixture-witnesses.test.ts`, `test/integration/list-narrowing-roundtrip.test.ts`, `test/integration/real-door-round-trip.test.ts`, `test/integration/soft-deleted-attachments.test.ts`
  - `test/permissions/check-project-exists.test.ts`, `test/permissions/check-role-permission.test.ts`, `test/permissions/check-visibility-permission.test.ts`
  - `test/read/ticket-key.test.ts`, `test/read/visible-where.test.ts`
  - `test/routes/attention.test.ts`, `board.test.ts`, `builder-reads.test.ts`, `list.test.ts`, `my-work.test.ts`, `notes.test.ts`, `preferences.test.ts`, `search.test.ts`, `ticket-history.test.ts`, `tickets-read.test.ts`, `workspace-counts.test.ts`, `workspaces.test.ts`
  - `test/stream/hub-integration.test.ts`
  - `test/sync/contests-route.test.ts`, `reconcile-route.test.ts`, `ticket-bootstrap-route.test.ts`
  - `test/visibility/can-read-note.test.ts`, `can-see.test.ts`, `rollup.test.ts`, `visible-events-for.test.ts`, `visible-tickets.test.ts`

  Plus `packages/app-core/test/views/my-work.test.tsx`: the grep hits it, and it is a client fixture. Check it, and expect no change.
- Modify: the case lines those tests cite, in `test-cases/06-…`, `07-…` and the `13-*` part-files. Amend them; never renumber.

**Interfaces:** none.

**The two populations, and why both must be handled:**
1. **Genuine reds.** `seedReadScenario` (`test/helpers/read-scenario.ts:120-250`) FOUNDS its project (`project.created` at `:136`). So its `outsider` (a member on no project) and any seeded admin now see every project-mode ticket, and every test that pinned their emptiness reddens. Task 1 Step 5's list is these.
2. **Vacuous greens — they stay green and are now wrong.** `seedTicket` and `seedMember` found nothing (`test/helpers/seed.ts:104-133` is the only founder). A test that seeds a ticket in an UNFOUNDED project and asserts an off-project admin cannot see it still passes. It now passes because the project was never founded, which production cannot produce, not because of any rule. The run cannot find these. Grep for them: in each file above, every `seedMember(…, 'admin' | 'member', [])` or `seedMember(…, [{ projectId: <other> }])` whose ticket's project has no `seedProject` call. The known one, read on this tree, is `test/visibility/can-see.test.ts:281-293`. Walk the rest.

**The amendment recipe, per test:**
- Keep the case id and the `it` title's id prefix.
- **A genuine red** gets an off-project admin or member who is now expected to SEE (or to create). Flip the expectation to rule A. Then restore the case's protective intent with a GUEST fixture where the case was about "someone who may not see": the read scenario's `guest` is the ready-made one. Every explicit-mode arm (an unlisted admin or member not seeing an `explicit` ticket) is UNCHANGED and must still pass.
- **A vacuous green:** found the project first (`await seedProject(db.pool, ws, prj)`), then apply the same flip.
- Amend the case line's prose. Append one sentence: "Amended 2026-09-29, owner ruling (A): an admin/member is on every founded project; the no-see witness is now a guest." If the case's whole subject was the admin-no-bypass rule, append "— its subject is retired; the case now pins the rule-A answer."
- **Never delete an explicit-mode assertion** to make a file green.

**Worked amendments (read on this tree, full code):**

`test/visibility/can-see.test.ts:281-293`, a vacuous green. Replace the whole `it`:

```ts
  /**
   * AMENDED 2026-09-29, owner ruling (A). This case read "an admin who has not
   * joined the project sees its project-mode tickets only after joining" and it
   * seeded NO project, so under rule A it kept passing for a reason production
   * cannot produce. The project is founded now, and the answer is rule A's.
   */
  it('an admin who has not joined the project sees its project-mode tickets — rule A, no join needed', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const admin = newUlid();
    const guest = newUlid();
    const tkt = newUlid();

    await seedProject(db.pool, ws, prj);
    await seedMember(db.pool, ws, admin, 'admin');
    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: tkt });
    expect(await canSee(db.pool, admin, tkt)).toBe(true);
    // The no-see witness the case used to be: someone on no project by any rule.
    expect(await canSee(db.pool, guest, tkt)).toBe(false);
  });
```

Add `seedProject` to that file's `../helpers/seed.js` import.

`test/permissions/check-visibility-permission.test.ts:125-144` ("creating a ticket requires being ON the project — there is no admin shortcut"). Under rule A and D7 it becomes:

```ts
  /**
   * AMENDED 2026-09-29, owner ruling (A) and deviation D7. This was "creating a
   * ticket requires being ON the project — there is no admin shortcut". Rule A
   * puts an admin and a member on every FOUNDED project, so both now create; the
   * refusal `NOT_ON_PROJECT_REASON` is unreachable by any shipped role (a guest
   * is refused earlier, an unfounded project earlier still) — recorded as D7.
   */
  it('rule A: an admin and a member off every roster create tickets in a founded project', async () => {
    const { workspaceId, projectId } = await workspace();
    const admin = newUlid();
    const member = newUlid();
    await seedMember(db.pool, workspaceId, admin, 'admin');
    await seedMember(db.pool, workspaceId, member, 'member', [{ projectId: newUlid() }]);

    for (const actor of [admin, member]) {
      expect(await gate(createTicketEvent(workspaceId, projectId, actor), actor)).toBeNull();
    }
  });
```

  Check that `workspace()` in that file founds `projectId` with `seedProject`, and read it to confirm. If it does not, found it inside this `it`.

`test/permissions/check-project-exists.test.ts`:
- **`:97-127` (6.30).** Keep the first assertion (`project.unknown` for the ghost). Replace the control with the same actor on `realProject` answering `null`, under the comment "rule A: the membership refusal no longer exists for a member; the ordering claim is now measured against the `project.unknown` arm alone — D7."
- **`:143-160`** ("a member ON a founded project still meets the project-membership refusal when they are not"). Its subject is D7's unreachable refusal. Make it assert `toBeNull()` for that member, and retitle it `'rule A: a member off every roster creates in a founded project (D7 — NOT_ON_PROJECT is unreachable)'`.

`test/routes/my-work.test.ts`:
- **7.104 (`:623-644`).** The outsider (a member on no project) now GETS the project-mode ticket assigned to them. Replace the body's expectations with `expect(groups.open).toEqual([...].sort())`, containing both `fx.outsiderExplicitId` and `fx.outsiderProjectId`, ordered as the file's `ORDER BY t.ticket_id` answers. Read the fixture ids to fix the order. Assert the body CONTAINS `'Stocktake'`. Retitle it `'7.104 AMENDED (A): a workspace member on NO project gets the project-mode ticket assigned to them'`.
- **7.113 (`:646-683`).** The admin is the assignee of a project-mode row. Under rule A that row is theirs to read, so the "three EMPTY groups" answer becomes `open: [fx.adminProjectId]` (or the group the fixture's state puts it in; read `fx`). Keep the 200-vs-404 half against `stranger` unchanged. Retitle it `'7.113 AMENDED (A): a workspace ADMIN gets the project-mode row assigned to them — admins are on every project'`.
- **7.107 (`:855-890`).** `project.member_removed` no longer takes the project away from a MEMBER (rule A), and the ticket stays assigned to them (W3, Task 3). So the mover stays. Assert the after-state equals the before-state, and keep the `assignee_id` read-back. Retitle it `'7.107 AMENDED (A): taken OFF the project roster, a member still sees their assigned ticket — rule A and the assignee arm both hold it'`.
- **The file docblock `:33-49` and `:66-81`.** Replace the list "Four cases separate them…" with one sentence: "Since 2026-09-29 (owner rulings A and W3) assignment IS enough to see one's own ticket, and an admin/member is on every project; the cases that separated assignment from visibility are amended in place (7.27, 7.104, 7.107, 7.108, 7.113)." Also delete the "One over-permissive mutation is NOT caught here" paragraph (`:74-81`) only if its guest claim no longer holds after Task 3. Leave it for Task 3 to decide.
- **7.27 and 7.108 are ASSIGNEE cases.** They belong to Task 3, not here. Leave them red if they are red after Task 1, and note them in the progress line.

`test/visibility/visible-events-for.test.ts` — **case 6.17** (scope revocation). `project.member_removed` naming a MEMBER no longer makes anything invisible. Amend the test to drive the same trigger against a GUEST who was named on explicit tickets through a project the test founds. If no guest shape yields a purge (a guest's project rows confer nothing), assert that the member's `project.member_removed` yields NO purge, and write in the case prose: "Amended 2026-09-29 (A): trigger (4) is now unreachable for an admin or member and inert for a guest; the roster-arm branch that emits it is a check no shipped fixture can make fire — recorded for the owner (D7's sibling)."

- [ ] **Step 1: Take Task 1 Step 5's red list.** For each red, open the test and the case line it cites.
- [ ] **Step 2: Apply the recipe.** Use the worked amendments above verbatim, and the recipe for the rest. Walk the vacuous-green grep over the files above and fix each unfounded fixture you find. List each one in the commit body with its file and line.
- [ ] **Step 3: Run the whole server suite** (`cd apps/server && pnpm exec vitest run --no-file-parallelism > /tmp/access-server.log 2>&1; tail -40 /tmp/access-server.log`). Expected: green, except for any 7.27 / 7.108-shaped reds you listed for Task 3. Then run `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/views/my-work.test.tsx > /tmp/access-app-core.log 2>&1; tail -20 /tmp/access-app-core.log`. Expected: green, and no change.
- [ ] **Step 4:** Run `node scripts/check-case-ids.mjs`: +0. Run `pnpm check:citations`: green.
- [ ] **Step 5: Commit** as `Access 2: amend the tests that pinned the admin/member no-see rule (owner ruling A)`. The body must list every amended case id, and separately every vacuous-green fixture that was founded.

---
### Task 3: The assignee sees their own ticket — and only that ticket

**Files:**
- Modify: `apps/server/src/visibility/can-see.ts`:
  - add `assigneeSees` and `currentAssignee` above `canSee` (`:251`);
  - change `canSee`'s body (`:251-258`).
- Modify: `apps/server/src/read/visible-where.ts`:
  - rename the body of `visibleTicketsWhere` (`:95-120`) to `ticketAudienceWhere`;
  - add `assigneeArmWhere` and a new `visibleTicketsWhere`;
  - switch the note inherit arm (`:279-283`) to `ticketAudienceWhere`.
- Modify: `apps/server/src/visibility/grant-backfill.ts:151` (`GRANT_BACKFILL_TRIGGERS`) and its docblock `:127-150`.
- Modify: `apps/server/src/routes/my-work.ts:53-62` (docblock).
- Create: `apps/server/test/visibility/assignee-visibility.test.ts`, `apps/server/test/routes/my-work-assignee.test.ts`.
- Modify: `apps/server/test/routes/my-work.test.ts` (7.27 at `:685-715`, 7.108 at `:892-923`).
- Modify: `test-cases/06-auth-visibility.md`, `test-cases/07-api-realtime-search.md`, `Features.md`.

**Interfaces:**
- Produces:
  - `export function assigneeSees(eff: EffectiveRole, userId: string, assigneeId: string | null): boolean`.
  - `canSee(db, userId, ticketId)` keeps its signature. It is now the audience rule OR `assigneeSees`.
  - `export function ticketAudienceWhere(eff: EffectiveRole, userId: string, params: SqlParams): string` is the old table, unchanged.
  - `export function assigneeArmWhere(userId: string, params: SqlParams): string`.
  - `visibleTicketsWhere(eff, userId, params)` keeps its signature and is now audience OR assignee.
  - `GRANT_BACKFILL_TRIGGERS` includes `'ticket.assigned'`.
- Consumes: Task 1's `resolveEffectiveRole` (unchanged signature).

**Why the note arm keeps the audience predicate.** Spec W3 says a note attached to the ticket is NOT opened by the assignment. `visibleNotesWhere`'s inherit arm (`visible-where.ts:279-283`) and `canReadNote`'s inherit arm (`can-read-note.ts:79-80`, `canSeeResolved`) are the two places a note reaches a ticket's audience. The second already asks the audience alone. The first must stop asking `visibleTicketsWhere` and ask `ticketAudienceWhere` instead, or the SQL and the TS answers split (18.021 would catch the split, but this case catches it first).

**Why `visibleTicketsWhere` has two early returns of its own.** `ticketAudienceWhere` answers `'TRUE'` for the owner and `'FALSE'` for a null role, with no parameter bound. The new function must return those same constants BEFORE it adds the assignee parameter. Otherwise a bound `$n` has nothing to reference, and Postgres refuses the statement (`visible-where.ts:84-89` records the hazard).

Cases for `06-auth-visibility.md`, under a new `## The assignee sees their own ticket (access plan, W3)`. Guard count +7:

```markdown
- ❌ **6.187 — `assigneeSees` is true for a guest, member or admin who IS the assignee, false for the same person when the ticket is assigned to someone else or to nobody, and false for anyone with no workspace role even when they are the assignee;** control: the member who is not the assignee is false. Mutation: drop the `eff.workspaceRole !== null` term.
- ❌ **6.188 — a GUEST assigned a project-mode ticket sees that ticket (`canSee`), and not its sibling in the same project, and not the parent of a child they are assigned;** control: the same guest sees the child they are assigned. Mutation: `canSee` returns `canSeeResolved(...)` alone.
- ❌ **6.189 — reassigning takes it back: once the ticket is assigned to someone else, the former guest assignee's `canSee` is false;** control: the new assignee's is true. Mutation: `currentAssignee` answers any non-null `assignee_id` as a match (`assignee_id IS NOT NULL`).
- ❌ **6.190 — the SQL twin agrees: `listVisibleTickets` for a guest assignee returns exactly the tickets `canSee` admits, over an assigned ticket, a sibling, a parent, its assigned child and an explicit ticket naming them;** control: the exact id set is asserted as well as the agreement. Mutation: `visibleTicketsWhere` returns `ticketAudienceWhere(...)` alone.
- ❌ **6.191 — a note is not opened by an assignment: a guest assigned the ticket an `inherit` note is attached to cannot read the note (`canReadNote` and `visibleNotesWhere` both refuse);** control: the guest the ticket's explicit list names reads it. Mutation: the note inherit arm calls `visibleTicketsWhere` instead of `ticketAudienceWhere`.
- ❌ **6.192 — `ticket.assigned` is a grant-backfill trigger, so a syncing device that could not see the ticket pulls its history when it becomes theirs;** control: `ticket.transitioned` is not a trigger. Mutation: remove `'ticket.assigned'` from `GRANT_BACKFILL_TRIGGERS`.
- ❌ **6.193 — an assignee REVOKED from the workspace sees nothing, though `proj_tickets` still names them;** control: the row still carries their id. Mutation: `assigneeSees` without the workspace-role term (6.187's mutation, reached through the database).
```

Cases for `07-api-realtime-search.md`, under `## My Work and the assignee (access plan, W3)`. +3:

```markdown
- ❌ **7.277 — a GUEST's My Work lists the project-mode ticket assigned to them;** control: their unassigned sibling is absent. Mutation: `visibleTicketsWhere` without the assignee arm.
- ❌ **7.278 — reassigning a ticket away removes the card from the former (guest) assignee's My Work at once;** control: a second ticket still assigned to them stays. Mutation: `assigneeArmWhere` matches `asg.assignee_id IS NOT NULL` instead of the viewer (the reassigned card stays).
- ❌ **7.279 — a guest assignee's My Work carries NO project name for the card's project — the assignment does not put the project in their list;** control: a member's My Work for the same card carries the name. Mutation: `readMyWork` builds `projectNames` from every card's project, not from `visibleProjects`.
```

- [ ] **Step 1: Write the cases.** Guard count: +10.

- [ ] **Step 2: Write the failing tests.** `apps/server/test/visibility/assignee-visibility.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { visibleNotesWhere } from '../../src/read/visible-where.js';
import { canReadNote, loadNoteForVisibility } from '../../src/visibility/can-read-note.js';
import { assigneeSees, canSee } from '../../src/visibility/can-see.js';
import { isGrantBackfillTrigger } from '../../src/visibility/grant-backfill.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture } from '../helpers/notes-fixture.js';
import {
  applyAll,
  revokeMember,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Access plan Task 3 — the assignee sees their own ticket (owner ruling
 * 2026-09-29, W3), cases 6.187–6.193.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/** Hand-built for the pure case only — the same named-cast site `can-see.test.ts` uses. */
function eff(role: EffectiveRole['workspaceRole']): EffectiveRole {
  return { workspaceRole: role, projects: new Map() } as unknown as EffectiveRole;
}

/**
 * Moves the assignee on the HEAD ROW, the way `seedTicket`'s `insertTicketHead`
 * writes it (`test/helpers/seed.ts`): the seeded world has no workflow
 * definition for `proj_tickets`' reducer to fold a `ticket.assigned` through, and
 * what `canSee` reads is exactly this column.
 */
async function reassign(ticketId: string, assigneeId: string | null): Promise<void> {
  await db.pool.query('UPDATE proj_tickets SET assignee_id = $2 WHERE ticket_id = $1', [ticketId, assigneeId]);
}

async function world() {
  const ws = newUlid();
  const project = newUlid();
  const guest = newUlid();
  const member = newUlid();
  const assigned = newUlid();
  const sibling = newUlid();
  const parent = newUlid();
  const child = newUlid();
  const explicit = newUlid();
  await seedProject(db.pool, ws, project);
  await seedMember(db.pool, ws, member, 'member');
  await seedGuest(db.pool, ws, guest);
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: assigned, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sibling });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: parent });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: child, parentId: parent, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: explicit });
  await applyAll(db.pool, [setVisibilityEnv(ws, explicit, 'explicit', [guest])]);
  return { ws, project, guest, member, assigned, sibling, parent, child, explicit };
}

describe('6.187 assigneeSees — pure', () => {
  it('6.187 true for the assignee at any role, false for a non-assignee, false with no role', () => {
    for (const role of ['guest', 'member', 'admin'] as const) {
      expect(assigneeSees(eff(role), 'u', 'u')).toBe(true);
      expect(assigneeSees(eff(role), 'u', 'someone-else')).toBe(false);
      expect(assigneeSees(eff(role), 'u', null)).toBe(false);
    }
    expect(assigneeSees(eff(null), 'u', 'u')).toBe(false);
  });
});

describe('6.188–6.190 the assignee arm against the real projections', () => {
  it('6.188 a guest sees the ticket assigned to them and nothing near it; CONTROL: the assigned child', async () => {
    const w = await world();
    expect(await canSee(db.pool, w.guest, w.assigned)).toBe(true);
    expect(await canSee(db.pool, w.guest, w.sibling)).toBe(false);
    expect(await canSee(db.pool, w.guest, w.parent)).toBe(false);
    expect(await canSee(db.pool, w.guest, w.child)).toBe(true);
  });

  it('6.189 reassigning takes it back; CONTROL: the new assignee sees it', async () => {
    const w = await world();
    const other = newUlid();
    await seedGuest(db.pool, w.ws, other);
    await reassign(w.assigned, other);
    expect(await canSee(db.pool, w.guest, w.assigned)).toBe(false);
    expect(await canSee(db.pool, other, w.assigned)).toBe(true);
  });

  it('6.190 listVisibleTickets agrees with canSee ticket by ticket; CONTROL: the exact set', async () => {
    const w = await world();
    const listed = (await listVisibleTickets(db.pool, w.guest, w.ws)).map((row) => row['ticket_id'] as string).sort();
    expect(listed).toEqual([w.assigned, w.child, w.explicit].sort());
    for (const id of [w.assigned, w.sibling, w.parent, w.child, w.explicit]) {
      expect(await canSee(db.pool, w.guest, id), id).toBe(listed.includes(id));
    }
  });
});

describe('6.191 a note is not opened by an assignment', () => {
  it('6.191 the assignee of the attached ticket cannot read the inherit note; CONTROL: the listed guest can', async () => {
    const f = await seedNotesFixture(db.pool);
    // TE is explicit to `guestListed` (the fixture's own shape); assign it to
    // `guestUnlisted`, who is on no list and no project.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: f.WS,
        actorId: f.ids.owner,
        entity: { kind: 'ticket', id: f.TE },
        type: 'ticket.assigned',
        payload: { assigneeId: f.ids.guestUnlisted },
      }),
    ]);
    expect(await canSee(db.pool, f.ids.guestUnlisted, f.TE)).toBe(true);

    const loaded = await loadNoteForVisibility(db.pool, f.NOTES.nInherit);
    expect(loaded).not.toBeNull();
    const readable = async (userId: string) => {
      const e = await resolveEffectiveRole(db.pool, userId, f.WS);
      const ts = canReadNote(e, userId, loaded!.note, loaded!.attachedVisibilities);
      const params = new SqlParams();
      const { rows } = await db.pool.query<{ note_id: string }>(
        `SELECT n.note_id FROM proj_notes n
          WHERE n.note_id = ${params.add(f.NOTES.nInherit)} AND ${visibleNotesWhere(e, userId, params)}`,
        params.toArray(),
      );
      return { ts, sql: rows.length === 1 };
    };
    expect(await readable(f.ids.guestUnlisted)).toEqual({ ts: false, sql: false });
    expect(await readable(f.ids.guestListed)).toEqual({ ts: true, sql: true });
  });
});

describe('6.192 ticket.assigned is a grant-backfill trigger', () => {
  it('6.192 it is; CONTROL: ticket.transitioned is not', () => {
    expect(isGrantBackfillTrigger('ticket.assigned')).toBe(true);
    expect(isGrantBackfillTrigger('ticket.transitioned')).toBe(false);
  });
});

describe('6.193 a revoked assignee sees nothing', () => {
  it('6.193 revoked from the workspace, still named on the row, canSee false', async () => {
    const w = await world();
    await revokeMember(db.pool, w.ws, w.guest);
    const { rows } = await db.pool.query<{ assignee_id: string }>(
      'SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1',
      [w.assigned],
    );
    expect(rows).toEqual([{ assignee_id: w.guest }]);
    expect(await canSee(db.pool, w.guest, w.assigned)).toBe(false);
  });
});
```

  `seedNotesFixture` guards against a second call per process (`test/helpers/notes-fixture.ts`, `SEEDED`). This file calls it once, so the guard holds.

  `apps/server/test/routes/my-work-assignee.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { readMyWork } from '../../src/routes/my-work.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedProject, seedTicket, seedWorkflowDef } from '../helpers/seed.js';

/**
 * Access plan Task 3, cases 7.277–7.279: My Work under W3 — the assignee's own
 * ticket is theirs to see, and nothing about its project comes with it.
 *
 * `seedWorkflowDef` (`test/helpers/seed.ts:489`) is called because
 * `readMyWork` → `stateNamesFor` reads the workflow the seeded head rows name.
 * If its signature differs from the call below, read it and adapt the call — the
 * assertion is on group ids and `projectNames` only.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

async function world() {
  const ws = newUlid();
  const project = newUlid();
  const guest = newUlid();
  const member = newUlid();
  const mine = newUlid();
  const alsoMine = newUlid();
  const sibling = newUlid();
  await seedWorkflowDef(db.pool, ws);
  await seedProject(db.pool, ws, project, 'Registrations');
  await seedGuest(db.pool, ws, guest);
  await seedMember(db.pool, ws, member, 'member');
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: mine, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: alsoMine, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sibling });
  return { ws, project, guest, member, mine, alsoMine, sibling };
}

async function myWorkIds(ws: string, viewerId: string): Promise<string[]> {
  const eff = await resolveEffectiveRole(db.pool, viewerId, ws);
  const work = await readMyWork(db.pool, eff, viewerId, ws);
  return [...work.groups.open, ...work.groups.active, ...work.groups.terminal].map((c) => c.ticketId).sort();
}

describe('7.277–7.279 My Work and the assignee', () => {
  it('7.277 a guest’s My Work lists the project-mode ticket assigned to them; CONTROL: not the sibling', async () => {
    const w = await world();
    const ids = await myWorkIds(w.ws, w.guest);
    expect(ids).toEqual([w.mine, w.alsoMine].sort());
    expect(ids).not.toContain(w.sibling);
  });

  it('7.278 reassigning away removes the card at once; CONTROL: the other one stays', async () => {
    const w = await world();
    await db.pool.query('UPDATE proj_tickets SET assignee_id = $2 WHERE ticket_id = $1', [w.mine, w.member]);
    expect(await myWorkIds(w.ws, w.guest)).toEqual([w.alsoMine]);
  });

  it('7.279 no project name reaches a guest assignee; CONTROL: a member assignee gets it', async () => {
    const w = await world();
    const guestEff = await resolveEffectiveRole(db.pool, w.guest, w.ws);
    expect((await readMyWork(db.pool, guestEff, w.guest, w.ws)).projectNames).toEqual({});

    await db.pool.query('UPDATE proj_tickets SET assignee_id = $2 WHERE ticket_id = $1', [w.alsoMine, w.member]);
    const memberEff = await resolveEffectiveRole(db.pool, w.member, w.ws);
    expect((await readMyWork(db.pool, memberEff, w.member, w.ws)).projectNames).toEqual({ [w.project]: 'Registrations' });
  });
});
```

  **Why 7.278 reassigns rather than clears.** Clearing to `NULL` would pass under the `IS NOT NULL` mutation too, so it is a vacuous fixture. A ticket moved to someone ELSE is the shape only the viewer-keyed arm can drop. Clearing is covered by `canSee` in 6.189's sibling shape and by the product's same code path.

- [ ] **Step 3: Run the two files and watch them fail.** Expected:
  - 6.188, 6.190, 6.191 (its first `canSee` line), 6.192 and 7.277–7.279 FAIL;
  - 6.187 fails to import (`assigneeSees` does not exist yet): a compile RED, so paste the error line;
  - 6.189 and 6.193 pass already (with no assignee arm, nobody sees these), so their mutations are the witness. Say so in the commit body.

- [ ] **Step 4: Implement.** In `apps/server/src/visibility/can-see.ts`, add above `canSee`:

```ts
/**
 * THE ASSIGNEE ARM (owner ruling 2026-09-29, access plan W3): "if an assignee is
 * assigned, even if that person does not have visibility to the workspace or
 * project, they can still get visibility to just that single ticket."
 *
 * Kept OUT of `canSeeResolved` deliberately. That function is the AUDIENCE
 * rule, and it has callers that must not widen with an assignment:
 * `canReadNote`'s inherit arm (a note is not opened by assigning its ticket),
 * the rollup's `restrictedCount` and the restricted-parent chip (the ticket's
 * relatives are not opened either). `canSee` — the one-ticket question — is the
 * only reader that ORs this in; its SQL twin is `assigneeArmWhere`.
 *
 * A workspace role is still required: an assignee put out of the workspace keeps
 * their name on the head row (`membership.revoked` touches no ticket) and sees
 * nothing (case 6.193).
 */
export function assigneeSees(eff: EffectiveRole, userId: string, assigneeId: string | null): boolean {
  return eff.workspaceRole !== null && assigneeId !== null && assigneeId === userId;
}

async function currentAssignee(db: Queryable, ticketId: string): Promise<string | null> {
  const { rows } = await db.query<{ assignee_id: string | null }>(
    'SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0]?.assignee_id ?? null;
}
```

  Replace `canSee`'s body:

```ts
export async function canSee(db: Queryable, userId: string, ticketId: string): Promise<boolean> {
  const v = await getResolvedVisibility(db, ticketId);
  if (v === null) {
    return false;
  }
  const eff = await resolveEffectiveRole(db, userId, v.workspaceId);
  if (canSeeResolved(eff, userId, v)) return true;
  // Only when the audience says no — the common answer costs no second read.
  return assigneeSees(eff, userId, await currentAssignee(db, ticketId));
}
```

  Add one paragraph to `canSee`'s docblock (`:176-250`), after "Unknown and invisible are the same answer": "## The assignee arm (W3) — `canSeeResolved` OR `assigneeSees`. The head row's CURRENT `assignee_id` is read, so reassigning takes the ticket away at once."

  In `apps/server/src/read/visible-where.ts`:
  - rename `export function visibleTicketsWhere(` at `:95` to `export function ticketAudienceWhere(`, and keep the body;
  - above its docblock, write one line: "`ticketAudienceWhere` is the AUDIENCE table alone — the note inherit arm's question. `visibleTicketsWhere` below is the one-ticket question: audience OR assignee (W3)."
  - then add, directly after it:

```ts
/**
 * The assignee arm in SQL (W3) — `assigneeSees`' twin. A subquery over `v`,
 * not `t.assignee_id`, because `listVisibleTickets` joins no `t`
 * (deviation D6; this file's own note on `LIVE_TICKET_WHERE`, reason 2).
 */
export function assigneeArmWhere(userId: string, params: SqlParams): string {
  return `EXISTS (SELECT 1 FROM proj_tickets asg WHERE asg.ticket_id = v.ticket_id AND asg.assignee_id = ${params.add(userId)})`;
}

/**
 * May this viewer see these tickets — the audience table OR the assignee arm.
 * Requires `proj_visibility` joined as `v`. Every list, board, search,
 * attention and My Work read calls this; the note inherit arm calls
 * `ticketAudienceWhere` instead (a note is not opened by an assignment).
 *
 * The two constant answers return BEFORE any parameter is bound, exactly as the
 * audience function's do (see "No parameter it does not use" above).
 */
export function visibleTicketsWhere(eff: EffectiveRole, userId: string, params: SqlParams): string {
  if (eff.workspaceRole === null) return 'FALSE';
  if (eff.workspaceRole === 'owner') return 'TRUE';
  return `(${ticketAudienceWhere(eff, userId, params)} OR ${assigneeArmWhere(userId, params)})`;
}
```

  - In `visibleNotesWhere`'s `inheritArm` (`:283`), replace `${visibleTicketsWhere(eff, userId, params)}` with `${ticketAudienceWhere(eff, userId, params)}`. Add a comment: "the AUDIENCE, not `visibleTicketsWhere` — a note is not opened by assigning its ticket (W3, case 6.191)."

  In `apps/server/src/visibility/grant-backfill.ts:151`, set:

```ts
export const GRANT_BACKFILL_TRIGGERS = ['visibility.set', 'ticket.reparented', 'ticket.assigned'] as const;
```

  In its docblock, add a bullet under "The trigger is the EVENT":

  > **`ticket.assigned` (W3, 2026-09-29)** widens the ticket to its new assignee, and only to them. It reaches this module only for readers `canSee` admits now, so it self-selects exactly as a widening `visibility.set` does. The former assignee is narrowed, never reaches this line, and loses the ticket at their next reconcile.

  In `apps/server/src/routes/my-work.ts:53-62`, replace the "## Assignment is not visibility" section with:

  > **## Assignment IS enough to see one's own ticket (owner ruling 2026-09-29, W3).** `visibleTicketsWhere` now ORs the assignee arm, so `t.assignee_id = $n` alone decides membership of this answer for anyone holding a workspace role. The predicate stays in the conjunction because it is also the tenancy-free statement of who may see a row, and removing it would make this the one read that re-expresses the rule.

- [ ] **Step 5: Amend 7.27 and 7.108** in `apps/server/test/routes/my-work.test.ts`.
  - **7.27 (`:685-715`)** keeps its title's id and becomes:

    > `'7.27 AMENDED (W3): the planted hidden ticket assigned to the member DOES appear — assignment is enough to see one’s own ticket'`

    Flip `not.toContain(read.world.hiddenTaskId)` to `toContain`. Keep `memberOpenId`'s presence. Delete the `'zebra-confidential'` absence: the comment's text is not on a My Work card, and a `toContain` on it would test the card shape, not this rule. Keep the owner half.
  - **7.108 (`:892-923`)** becomes:

    > `'7.108 AMENDED (W3): visibility NARROWED after assignment keeps the card — the guest is still the assignee'`

    The after-state equals the before-state `{ open: [fx.guestKeepId, fx.guestNarrowId], … }`, and the body contains `'Draft the settlement note'`.
  - Amend both case lines in `test-cases/07-api-realtime-search.md` with "Amended 2026-09-29, owner ruling (W3): assignment is enough to see one's own ticket; 7.277 pins the new rule."

- [ ] **Step 6: Run and watch it pass.**
  - Run the two new files and `my-work.test.ts`, `visible-where.test.ts`, `visible-tickets.test.ts`, `grant-backfill.test.ts` and `test/routes/notes.test.ts`.
  - Expected: green. If `grant-backfill.test.ts` pins the trigger list's exact contents (its docblock at `:65` names "emptied" as a mutation), extend its list by `'ticket.assigned'` and cite 6.192 there.
  - Then run the whole server suite.

- [ ] **Step 7: Flip 6.187–6.193 and 7.277–7.279 to ✅. Features.md:**
  - under `canSee` (`:523`) append:

    ```markdown
      - ⚙️ **The assignee sees their own ticket — that one ticket** (owner ruling 2026-09-29; access plan Task 3; `visibility/can-see.ts` `assigneeSees`, `read/visible-where.ts` `assigneeArmWhere`) — `canSee` and `visibleTicketsWhere` OR the head row's CURRENT assignee (a workspace role still required), so a guest assigned a project-mode ticket sees it in the sheet, My Work, search and the stream, and not its parent, children or project; reassigning takes it back. Notes stay on the audience predicate (`ticketAudienceWhere`), so a note is not opened by an assignment. `ticket.assigned` is a grant-backfill trigger. Residual: the rollup's `restrictedCount` and the restricted-parent chip ask the audience alone. Cases 6.187–6.193, 7.277–7.279.
    ```

- [ ] **Step 8: Commit** as `Access 3: the assignee sees their own ticket (6.187-6.193, 7.277-7.279)`. Then work through the mutations.

---

### Task 4: Notify the New ticket dialog's assignee

**Files:**
- Modify: `apps/server/src/notifications/fanout.ts:240-259` (`onCommitted`), and the module docblock (`:16-42`).
- Test: `apps/server/test/notifications/fanout.test.ts`. Append one describe after `ticket.assigned`'s (`:182-278`), and amend the prose of `:256-265`.
- Modify: `test-cases/11-calendar-notifications.md`, `Features.md`.

**Interfaces:**
- Consumes: `handleAssigned(env)`, private to `createNotificationFanout` (`fanout.ts:124-144`). Its `assignedPayloadSchema` (`:44`) is `z.object({ assigneeId: z.string().nullable() }).passthrough()`, so it parses a `ticket.created` payload that carries `assigneeId`. A payload with NO `assigneeId` key fails the parse and returns, which is the "born unassigned" answer.
- Produces: nothing new. The fan-out's only change is observable in `notifications` rows.

Cases, under a new `## Notify on create (access plan, W4)`. +3:

```markdown
- ❌ **11.225 — a `ticket.created` carrying `assigneeId` (not the actor) delivers ONE `assignment` notification to that person, with the ticket's title and the creator as `assignedBy`, keyed `assignment:<event id>`;** control: a `ticket.created` with no `assigneeId` delivers nothing. Mutation: delete the `ticket.created` branch from `onCommitted`.
- ❌ **11.226 — the creator assigning themselves at birth, and `assigneeId: null`, deliver nothing;** control: the same event with another person does. Mutation: route `ticket.created` around `handleAssigned`'s self/null guard (call `deliverToAll` directly).
- ❌ **11.227 — the same committed `ticket.created` delivered twice yields ONE row;** control: a different `ticket.created` for the same person is a second row. Mutation: key the dedupe on `newUlid()` instead of `env.id`.
```

- [ ] **Step 1: Write the cases.** Guard: +3.

- [ ] **Step 2: Write the failing test.** Append to `apps/server/test/notifications/fanout.test.ts`. It reuses the file's `WS`, `PROJECT`, `KIRO`, `ANSELMA`, `visible`, `fanout()` and `seedTicket` (all above `:182`), and its `rowsFor(userId)` helper, which the `ticket.assigned` describe already uses. Read its definition and use it as it is.

```ts
/**
 * Access plan Task 4 (owner ruling 2026-09-29, W4): "Notify on the New ticket
 * dialog's assignee." The dialog puts the assignee on `ticket.created`
 * (`packages/app-core/src/views/create-ticket-flow.tsx:327`), and until this
 * branch nothing read it.
 */
describe('11.225–11.227 ticket.created with a birth assignee', () => {
  const CREATED_TICKET = '01J9GTKC000000000000000000';

  function created(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
    // The file's own `assigned()` shape (`:171-180`), with the birth payload.
    return makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: CREATED_TICKET },
      workspaceId: WS,
      actorId: KIRO,
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Order the tent', assigneeId: ANSELMA },
      ...overrides,
    });
  }

  it('11.225 one assignment row for the birth assignee; CONTROL: born unassigned delivers nothing', async () => {
    await seedTicket(CREATED_TICKET, ANSELMA, 'Order the tent');
    visible.add(`${ANSELMA}:${CREATED_TICKET}`);
    const env = created();
    await fanout().onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'assignment',
      dedupe_key: `assignment:${env.id}`,
      payload: expect.objectContaining({ ticketId: CREATED_TICKET, ticketTitle: 'Order the tent', assignedBy: KIRO }),
    });

    const { assigneeId: _dropped, ...bare } = env.payload as Record<string, unknown>;
    await fanout().onCommitted(created({ payload: bare }));
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  it('11.226 self-assignment and null tell nobody; CONTROL: another person is told', async () => {
    await seedTicket(CREATED_TICKET, KIRO, 'Order the tent');
    visible.add(`${KIRO}:${CREATED_TICKET}`);
    visible.add(`${ANSELMA}:${CREATED_TICKET}`);
    await fanout().onCommitted(created({ payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'x', assigneeId: KIRO } }));
    await fanout().onCommitted(created({ payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'x', assigneeId: null } }));
    expect(await rowsFor(KIRO)).toHaveLength(0);
    await fanout().onCommitted(created());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  it('11.227 redelivery is one row; CONTROL: a different event is a second row', async () => {
    await seedTicket(CREATED_TICKET, ANSELMA, 'Order the tent');
    visible.add(`${ANSELMA}:${CREATED_TICKET}`);
    const env = created();
    await fanout().onCommitted(env);
    await fanout().onCommitted(env);
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
    await fanout().onCommitted(created());
    expect(await rowsFor(ANSELMA)).toHaveLength(2);
  });
});
```

  `rowsFor` (`:128-139`) answers snake_case columns, hence `dedupe_key`. `makeEnvelope` mints a fresh `id` per call, which is what 11.227's control relies on. The file's `beforeEach` (`:162`) resets state between cases. Read it, and if it does not truncate `notifications` and `proj_tickets`, give each `it` its own ticket id.

- [ ] **Step 3: Run and watch it fail.** `cd apps/server && pnpm exec vitest run --no-file-parallelism test/notifications/fanout.test.ts > /tmp/access-server.log 2>&1; tail -25 /tmp/access-server.log`.
  - Expected: 11.225 and 11.227 FAIL (zero rows).
  - 11.226's first half passes, and its control half fails.

- [ ] **Step 4: Implement.** In `fanout.ts`'s `onCommitted`, change the first branch to:

```ts
        if (env.type === 'ticket.assigned' || env.type === 'ticket.created') {
          // `ticket.created` carries the New ticket dialog's birth assignee
          // (W4, owner ruling 2026-09-29). Same handler, same guards (unassigned,
          // self), same `canSee` gate — which the assignee arm (W3) now answers
          // true for them — and the same `assignment:${env.id}` key, so a
          // redelivery is one row. A payload with no `assigneeId` fails the
          // handler's parse and addresses nobody: born unassigned.
          await handleAssigned(env);
```

  Add to the module docblock's first paragraph: "`ticket.created` with a birth `assigneeId` is an assignment too (W4)."

  Amend the prose of the planted-defect test at `:256` without changing its body. The injected `canSeeTicket` is a fake, so the gate it pins still exists. Rename it to:

  > `'an assignee the gate refuses gets nothing — since W3 the real gate refuses only someone out of the workspace or a vanished ticket (planted defect)'`

- [ ] **Step 5: Run and watch it pass.** Same command. Expected: the file is green.

- [ ] **Step 6: Flip 11.225–11.227. Features.md:** under `Notification fan-out` (`:2720`) append:

    ```markdown
      - ⚙️ **A birth assignee is notified** (owner ruling 2026-09-29; access plan Task 4) — `ticket.created` carrying `assigneeId` goes through the same `handleAssigned` as `ticket.assigned`: same guards, same gate, same `assignment:<event id>` key. Cases 11.225–11.227.
    ```

- [ ] **Step 7: Commit** as `Access 4: notify the New ticket dialog's assignee (11.225-11.227)`, then work through the mutations.

---
### Task 5: The invitation is actually emailed

**Files:**
- Modify: `apps/server/src/config.ts`:
  - the schema after `MAGIC_LINK_FROM` (`:225`);
  - `AppConfig` (`:253-271`);
  - `loadConfig`'s return (`:301-302`).
- Modify: `.env.example` (after `:265`).
- Create: `apps/server/src/invites/invite-mailer.ts`.
- Modify: `apps/server/src/routes/invites.ts`:
  - `InviteRouteDeps` (`:35-43`);
  - the mint handler after the token insert (`:361-376`).
- Modify: `apps/server/src/app.ts`:
  - `AppDeps` (after `webOrigin`, `:132`);
  - `registerInviteRoutes`' call (`:882-886`).
- Modify: `apps/server/src/index.ts` (`buildApp`'s deps, `:130-156`).
- Modify: `apps/server/test/helpers/app.ts` (`BuildTestAppOverrides` `:50-…`, and `buildTestApp` `:167-191`).
- Test: `apps/server/test/invites/invite-mailer.test.ts`, `apps/server/test/routes/invites-email.test.ts`, `apps/server/test/config.test.ts`.
- Modify: `test-cases/06-auth-visibility.md`, `Features.md`.

**Interfaces:**
- Produces:
  - `AppConfig.inviteFrom: string`, from `INVITE_FROM`. It defaults to `magicLinkFrom`.
  - `invites/invite-mailer.ts`:
    - `type InviteEmail = { to: string; inviterName: string; workspaceName: string; role: string; url: string; expiresAt: string }`;
    - `inviteSubject(inviterName, workspaceName): string`;
    - `composeInviteEmail(mail): { subject: string; text: string }`;
    - `interface InviteMailer { send(mail: InviteEmail): Promise<void> }`;
    - `class LogInviteMailer` (`sent: InviteEmail[]`);
    - `class SmtpInviteMailer(smtpUrl, from, transporter?)`;
    - `selectInviteMailer(config: Pick<AppConfig, 'smtpUrl' | 'inviteFrom'>): InviteMailer`;
    - `INVITER_FALLBACK = 'Someone'`.
  - `InviteRouteDeps` gains `mailer: InviteMailer; alerter: ErrorAlerter`.
  - `AppDeps` gains `inviteMailer?: InviteMailer`. Absent, it is a silent `LogInviteMailer`: this is the test default, and `index.ts` always passes `selectInviteMailer(config)`.
  - `BuildTestAppOverrides` gains `inviteMailer?: InviteMailer; alerter?: ErrorAlerter`.
  - The mint response gains `emailSent: boolean`. Task 8 reads it.
- Consumes: `SMTP_TIMEOUTS_MS` (`auth/smtp-magic-link-sender.ts:32-36`), `formatIstInstant` (`@gisik-nokma/domain`, `clock-skew.ts:51`), `workspaceNameFromLedger` (`workspaces/workspace-name.ts:46`), `alertWithoutWaiting` (`alerts/error-alerter.ts:123`), `isSyntheticPhoneEmail` (`auth/synthetic-address.ts:65`).

Cases, under `## The invitation is emailed (access plan, W5)`. +8:

```markdown
- ❌ **6.194 — `composeInviteEmail` writes the subject `<inviter> invited you to <workspace> on Gisik Nokma` and a body naming the inviter, the workspace, the role, the link on its own line and the expiry as an IST day and time;** control: a different role and expiry change exactly those two parts. Mutation: drop the expiry sentence.
- ❌ **6.195 — `SmtpInviteMailer` sends ONE message From `inviteFrom` To the address, with that subject, as `text/plain` only — no `text/html` part (deviation D4);** control: the decoded body contains the link. Mutation: add `html: text` to `sendMail`.
- ❌ **6.196 — `selectInviteMailer` answers `SmtpInviteMailer` when `SMTP_URL` is set and `LogInviteMailer` when it is not;** control: the SMTP one carries `inviteFrom`. Mutation: always answer the log mailer.
- ❌ **6.197 — `INVITE_FROM` defaults to `MAGIC_LINK_FROM`, an explicit value wins, and a malformed one is refused naming the variable;** control: the exact-shape config object carries `inviteFrom`. Mutation: default `inviteFrom` to the literal `sign-in@gisik-nokma.local`.
- ❌ **6.198 — an EMAIL invitation is mailed once, to the typed address, carrying the minted url, and answers `emailSent: true`;** control: the mailer's `inviterName` is the inviter's account label, not their id. Mutation: skip the send.
- ❌ **6.199 — a PHONE invitation is not mailed and answers `emailSent: false`;** control: the same admin's email invitation is mailed. Mutation: send regardless of channel.
- ❌ **6.200 — a THROWING mailer: 201, `emailSent: false`, the url still in the body and still openable, and the alerter told with a context that contains no token;** control: the token's `GET /v1/invites/:token` answers 200. Mutation: `await deps.mailer.send(...)` outside the `try`.
- ❌ **6.201 — the mail is sent only AFTER the credential exists: at the moment `send` runs, `invite_tokens` already holds the invitation's row;** control: the row count is read inside the mailer, not after the route. Mutation: move the send above the `INSERT INTO invite_tokens`.
```

- [ ] **Step 1: Write the cases.** Guard: +8.

- [ ] **Step 2: Write the failing tests.** `apps/server/test/invites/invite-mailer.test.ts`:

```ts
import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import {
  composeInviteEmail,
  inviteSubject,
  LogInviteMailer,
  selectInviteMailer,
  SmtpInviteMailer,
  type InviteEmail,
} from '../../src/invites/invite-mailer.js';

/** Access plan Task 5, cases 6.194–6.196 (W5, deviation D4). */

const MAIL: InviteEmail = {
  to: 'anselma@example.test',
  inviterName: 'Kiro',
  workspaceName: 'Convenience Corner',
  role: 'member',
  url: 'https://pm.example.test/invite/aBc-123_xyz',
  expiresAt: '2026-10-13T10:00:00.000Z',
};

/** Quoted-printable decoding, as `smtp-magic-link-sender.test.ts` does it. */
function decodeQuotedPrintable(body: string): string {
  return body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

describe('6.194 composeInviteEmail', () => {
  it('6.194 subject and body carry inviter, workspace, role, link and IST expiry; CONTROL: role and expiry move only their parts', () => {
    const { subject, text } = composeInviteEmail(MAIL);
    expect(subject).toBe('Kiro invited you to Convenience Corner on Gisik Nokma');
    expect(subject).toBe(inviteSubject('Kiro', 'Convenience Corner'));
    expect(text).toBe(
      'Kiro invited you to join Convenience Corner on Gisik Nokma as a member.\n\n' +
        'Open this link to accept:\n\n' +
        'https://pm.example.test/invite/aBc-123_xyz\n\n' +
        'The link stops working after 13 Oct 2026, 15:30 IST. It can be used once. ' +
        'If you were not expecting this, ignore this message.',
    );
    const other = composeInviteEmail({ ...MAIL, role: 'admin', expiresAt: '2026-10-14T18:45:00.000Z' });
    expect(other.text).toContain('as an admin.');
    expect(other.text).toContain('after 15 Oct 2026, 00:15 IST.');
    expect(other.subject).toBe(subject);
  });
});

describe('6.195 SmtpInviteMailer', () => {
  it('6.195 one plain-text message From inviteFrom To the address; CONTROL: the decoded body carries the link', async () => {
    const raw: string[] = [];
    const transporter = createTransport({ streamTransport: true, buffer: true });
    const original = transporter.sendMail.bind(transporter);
    transporter.sendMail = (async (options: Parameters<typeof original>[0]) => {
      const info = await original(options);
      raw.push(String(info.message));
      return info;
    }) as typeof transporter.sendMail;

    await new SmtpInviteMailer('smtp://unused.invalid:25', 'contact@example.test', transporter).send(MAIL);

    expect(raw).toHaveLength(1);
    const message = raw[0]!;
    const headers = message.slice(0, message.indexOf('\r\n\r\n'));
    expect(headers).toMatch(/^From: contact@example\.test$/m);
    expect(headers).toMatch(/^To: anselma@example\.test$/m);
    expect(headers).toMatch(/^Subject: Kiro invited you to Convenience Corner on Gisik Nokma$/m);
    expect(message).toMatch(/Content-Type: text\/plain/);
    expect(message).not.toMatch(/text\/html/);
    expect(decodeQuotedPrintable(message)).toContain('https://pm.example.test/invite/aBc-123_xyz');
  });
});

describe('6.196 selectInviteMailer', () => {
  it('6.196 SMTP when SMTP_URL is set, the log mailer when not; CONTROL: the SMTP one carries inviteFrom', () => {
    expect(selectInviteMailer({ smtpUrl: null, inviteFrom: 'a@example.test' })).toBeInstanceOf(LogInviteMailer);
    const smtp = selectInviteMailer({ smtpUrl: 'smtp://localhost:1025', inviteFrom: 'a@example.test' });
    expect(smtp).toBeInstanceOf(SmtpInviteMailer);
    expect((smtp as unknown as { from: string }).from).toBe('a@example.test');
  });
});

describe('6.197 INVITE_FROM', () => {
  const BASE = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'test-secret-not-used-anywhere-real',
    WEB_ORIGIN: 'http://localhost:3001',
  };
  it('6.197 defaults to MAGIC_LINK_FROM, an explicit value wins, a malformed one is refused', () => {
    expect(loadConfig({ ...BASE, MAGIC_LINK_FROM: 'contact@example.test' }).inviteFrom).toBe('contact@example.test');
    expect(loadConfig({ ...BASE, MAGIC_LINK_FROM: 'contact@example.test', INVITE_FROM: 'team@example.test' }).inviteFrom).toBe(
      'team@example.test',
    );
    expect(() => loadConfig({ ...BASE, INVITE_FROM: 'not-an-address' })).toThrowError(
      'invalid server configuration — check: INVITE_FROM',
    );
  });
});
```

  `BASE` must satisfy every required variable in `config.ts`'s schema. Read `test/config.test.ts`'s `VALID_ENV` and use it instead of `BASE` if it is exported or easy to copy.

  In `apps/server/test/config.test.ts`, add `inviteFrom: 'sign-in@gisik-nokma.local',` to the exact-shape object after `magicLinkFrom` (`:46`). That is 6.197's control.

  `apps/server/test/routes/invites-email.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { InviteEmail, InviteMailer } from '../../src/invites/invite-mailer.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Access plan Task 5, cases 6.198–6.201 (W5). The mailer and the alerter are
 * INJECTED through `buildTestApp`'s overrides; what is asserted is what the
 * route handed them and what it answered.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

type Behaviour = 'record' | 'throw' | 'count-tokens';
let behaviour: Behaviour = 'record';
const mailed: InviteEmail[] = [];
const tokenRowsAtSend: number[] = [];
const alerts: Array<{ context: string; error: unknown }> = [];

const mailer: InviteMailer = {
  async send(mail) {
    if (behaviour === 'throw') throw new Error('SMTP 421 service not available');
    if (behaviour === 'count-tokens') {
      const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM invite_tokens');
      tokenRowsAtSend.push(rows[0]!.n);
    }
    mailed.push(mail);
  },
};
const alerter: ErrorAlerter = {
  async notify(context, error) {
    alerts.push({ context, error });
  },
};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db, { inviteMailer: mailer, alerter });
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phone = 0;
async function signedIn() {
  phone += 1;
  const user = await signInWithPhone(app, otp, `+9190015${String(phone).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

async function found(owner: { headers: { authorization: string } }) {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: owner.headers, payload: { name: 'Convenience Corner' } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

function mint(caller: { headers: { authorization: string } }, workspaceId: string, channel: 'email' | 'phone', address: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/workspaces/${workspaceId}/invites`,
    headers: caller.headers,
    payload: { address, channel, role: 'member' },
  });
}

describe('6.198–6.201 the mint route emails an email invitation', () => {
  it('6.198 mailed once with the url, emailSent true; CONTROL: inviterName is a label, not an id', async () => {
    behaviour = 'record';
    mailed.length = 0;
    const owner = await signedIn();
    const ws = await found(owner);
    const res = await mint(owner, ws, 'email', 'anselma@example.test');
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { url: string; emailSent: boolean };
    expect(body.emailSent).toBe(true);
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatchObject({ to: 'anselma@example.test', url: body.url, workspaceName: 'Convenience Corner', role: 'member' });
    expect(mailed[0]!.inviterName).not.toBe(owner.userId);
    expect(mailed[0]!.inviterName).not.toBe('');
  });

  it('6.199 a phone invitation is not mailed, emailSent false; CONTROL: an email one is', async () => {
    behaviour = 'record';
    mailed.length = 0;
    const owner = await signedIn();
    const ws = await found(owner);
    const phoneRes = await mint(owner, ws, 'phone', '+919001400001');
    expect(phoneRes.statusCode, phoneRes.body).toBe(201);
    expect((phoneRes.json() as { emailSent: boolean }).emailSent).toBe(false);
    expect(mailed).toHaveLength(0);
    await mint(owner, ws, 'email', 'balti@example.test');
    expect(mailed).toHaveLength(1);
  });

  it('6.200 a throwing mailer: 201, emailSent false, link openable, alerter told without the token', async () => {
    behaviour = 'throw';
    alerts.length = 0;
    const owner = await signedIn();
    const ws = await found(owner);
    const res = await mint(owner, ws, 'email', 'dipu@example.test');
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { url: string; emailSent: boolean };
    expect(body.emailSent).toBe(false);
    const token = body.url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
    // Fire-and-forget: give the alerter's microtask a turn.
    await new Promise((resolve) => setImmediate(resolve));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.context).not.toContain(token);
    expect((await app.inject({ method: 'GET', url: `/v1/invites/${token}` })).statusCode).toBe(200);
  });

  it('6.201 the credential exists before the mail goes; CONTROL: read inside the mailer', async () => {
    behaviour = 'count-tokens';
    tokenRowsAtSend.length = 0;
    await db.pool.query('TRUNCATE invite_tokens');
    const owner = await signedIn();
    const ws = await found(owner);
    await mint(owner, ws, 'email', 'era@example.test');
    expect(tokenRowsAtSend).toEqual([1]);
  });
});
```

  Read `signInWithPhone`'s phone format in `test/routes/invites.test.ts:38-43` and match its `+9190014…` shape with a different prefix, as written above. A phone-signed-in owner's account name is their phone (`auth.ts`'s `getTempName`), so 6.198's label assertion holds.

- [ ] **Step 3: Run and watch it fail.** Run both files and `test/config.test.ts`. Expected:
  - the mailer file fails to import (a compile RED — paste it);
  - `invites-email.test.ts` fails because `buildTestApp` does not accept the overrides (`tsc`), and at runtime because `emailSent` is `undefined`;
  - `config.test.ts`'s exact-shape case fails on the extra key only after Step 4, so paste its RED from the Step 4 run with the key added to the test first.

- [ ] **Step 4: Implement.**

  In `apps/server/src/config.ts`, after `MAGIC_LINK_FROM` (`:225`):

```ts
  /**
   * The From address on INVITATION mail (access plan W5). Optional: absent means
   * the sign-in sender's address (`MAGIC_LINK_FROM`), which in production is
   * `contact@artsourced.in` (`deploy/do/app.yaml:181-182`) — so no app-spec change
   * is needed to start sending. A separate knob because an invitation and a
   * sign-in link are different letters and an operator may want them from
   * different mailboxes.
   */
  INVITE_FROM: unsetWhenEmpty(z.string().email().optional()),
```

  Add `inviteFrom: string;` to `AppConfig` after `magicLinkFrom`, and `inviteFrom: parsed.data.INVITE_FROM ?? parsed.data.MAGIC_LINK_FROM,` to `loadConfig`'s return after `magicLinkFrom`.

  In `.env.example` after `MAGIC_LINK_FROM=…` (`:265`):

```
# Invitation email (access plan W5). Optional — EMPTY means "the MAGIC_LINK_FROM
# address", which is the production answer today. Consumed by
# `invites/invite-mailer.ts` through `selectInviteMailer`: SMTP_URL set sends
# real mail, unset logs one line per invitation WITHOUT the link.
INVITE_FROM=
```

  If `config.test.ts` pins the documented-EMPTY keys (its paragraph after `:300` names `ALERT_WEBHOOK_URL` and `DATABASE_CA_CERT`), add `INVITE_FROM` to that list.

  Create `apps/server/src/invites/invite-mailer.ts`:

```ts
import { formatIstInstant } from '@gisik-nokma/domain';
import { createTransport, type Transporter } from 'nodemailer';
import { SMTP_TIMEOUTS_MS } from '../auth/smtp-magic-link-sender.js';
import type { AppConfig } from '../config.js';

/**
 * The invitation letter (access plan W5, owner ruling 2026-09-29: "make the
 * invite actually send email").
 *
 * PLAIN TEXT ONLY — deviation D4. The link is the credential, and the sign-in
 * sender's reason holds word for word (`../auth/smtp-magic-link-sender.ts`,
 * the comment on `text`): an HTML body invites a mail client to rewrite or wrap
 * the link. The link sits alone on its own line.
 */
export type InviteEmail = {
  to: string;
  /** The inviter's account name, else their real email, else `INVITER_FALLBACK`. Never an id. */
  inviterName: string;
  workspaceName: string;
  role: string;
  url: string;
  /** The TOKEN's expiry, an ISO instant; rendered as an IST day and time. */
  expiresAt: string;
};

/** When the inviter has neither a name nor a real address (a phone account always has a name). */
export const INVITER_FALLBACK = 'Someone';

export function inviteSubject(inviterName: string, workspaceName: string): string {
  return `${inviterName} invited you to ${workspaceName} on Gisik Nokma`;
}

export function composeInviteEmail(mail: InviteEmail): { subject: string; text: string } {
  const article = mail.role === 'admin' ? 'an' : 'a';
  return {
    subject: inviteSubject(mail.inviterName, mail.workspaceName),
    text:
      `${mail.inviterName} invited you to join ${mail.workspaceName} on Gisik Nokma as ${article} ${mail.role}.\n\n` +
      `Open this link to accept:\n\n${mail.url}\n\n` +
      `The link stops working after ${formatIstInstant(mail.expiresAt)}. It can be used once. ` +
      'If you were not expecting this, ignore this message.',
  };
}

export interface InviteMailer {
  send(mail: InviteEmail): Promise<void>;
}

/**
 * The dev/test mailer. It records, and logs ONE line that names the recipient
 * and the workspace and WITHHOLDS the link — unlike `LogMagicLinkSender`, whose
 * link is the only way a developer signs in. An invitation's link is already on
 * the inviter's screen, and `routes/invites.ts`'s `redactInviteToken` exists so
 * a credential never reaches the process log.
 */
export class LogInviteMailer implements InviteMailer {
  public readonly sent: InviteEmail[] = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  async send(mail: InviteEmail): Promise<void> {
    this.sent.push(mail);
    this.log(`[dev-invite-mail] invitation for ${mail.to} to ${mail.workspaceName} (link withheld)`);
  }
}

/**
 * Real delivery, over the SAME transport rules as the sign-in sender: a URL and
 * nothing else, the options object carrying `url` so `smtps:`/`user:pass` parse,
 * and the same bounded timeouts. The third argument is the test seam, exactly
 * as `SmtpMagicLinkSender`'s is.
 */
export class SmtpInviteMailer implements InviteMailer {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    transporter?: Transporter,
  ) {
    this.transporter = transporter ?? createTransport({ url: smtpUrl, ...SMTP_TIMEOUTS_MS });
  }

  async send(mail: InviteEmail): Promise<void> {
    const { subject, text } = composeInviteEmail(mail);
    await this.transporter.sendMail({ from: this.from, to: mail.to, subject, text });
  }
}

/** `SMTP_URL` set means real mail; unset means the log mailer — the magic-link rule (`../auth/select-senders.ts:32-38`). */
export function selectInviteMailer(config: Pick<AppConfig, 'smtpUrl' | 'inviteFrom'>): InviteMailer {
  return config.smtpUrl === null ? new LogInviteMailer() : new SmtpInviteMailer(config.smtpUrl, config.inviteFrom);
}
```

  In `apps/server/src/routes/invites.ts`:
  - Import `alertWithoutWaiting, type ErrorAlerter` from `'../alerts/error-alerter.js'`, `isSyntheticPhoneEmail` from `'../auth/synthetic-address.js'`, and `INVITER_FALLBACK, type InviteMailer` from `'../invites/invite-mailer.js'`.
  - Add to `InviteRouteDeps`:

    ```ts
      /** Where an EMAIL invitation's letter goes (access plan W5). */
      mailer: InviteMailer;
      /** Told, without waiting, when that letter fails — the invitation still stands. */
      alerter: ErrorAlerter;
    ```

  - Add, above `registerInviteRoutes`:

```ts
/** The inviter as a person would name them: account name, else a REAL email, else `INVITER_FALLBACK`. */
async function inviterLabel(db: Queryable, userId: string): Promise<string> {
  const { rows } = await db.query<{ name: string | null; email: string | null }>(
    'SELECT "name", "email" FROM "user" WHERE "id" = $1',
    [userId],
  );
  const name = rows[0]?.name?.trim() ?? '';
  if (name !== '') return name;
  const email = rows[0]?.email ?? '';
  return email !== '' && !isSyntheticPhoneEmail(email) ? email : INVITER_FALLBACK;
}
```

  - In the mint handler, replace the final `return reply.code(201).send({ … })` (`:371-375`) with:

```ts
      const url = `${deps.webOrigin}/invite/${token}`;
      // THE LETTER (access plan W5) — email channel only, and only now, AFTER
      // the credential exists (case 6.201): a crash before this line leaves an
      // invitation the admin still holds the link to; a letter sent before the
      // INSERT could carry a link that never opens. A failure is logged and
      // alerted and answered as `emailSent: false` — never a 500, because the
      // invitation itself committed and the one-time link below is still the
      // admin's to hand over (case 6.200). The alert context names the
      // invitation, never the url: the url IS the credential.
      let emailSent = false;
      if (channel === 'email') {
        try {
          await deps.mailer.send({
            to: address,
            inviterName: await inviterLabel(deps.pool, request.currentUserId),
            workspaceName: (await workspaceNameFromLedger(deps.pool, workspaceId)) ?? 'a workspace',
            role,
            url,
            expiresAt: expiresAt.toISOString(),
          });
          emailSent = true;
        } catch (error) {
          request.log.error({ err: error, inviteId }, 'invitation email failed');
          alertWithoutWaiting(deps.alerter, `invitation email for invite ${inviteId}`, error);
        }
      }
      return reply.code(201).send({ inviteId, url, expiresAt: expiresAt.toISOString(), emailSent });
```

  In `apps/server/src/app.ts`:
  - import `LogInviteMailer, type InviteMailer` from `'./invites/invite-mailer.js'`;
  - add to `AppDeps` after `webOrigin`:

```ts
  /**
   * Where invitation letters go (access plan W5). OPTIONAL, and absent means a
   * SILENT `LogInviteMailer`: that is the ~sixty test files' default, which mint
   * invitations and never asked for mail. `index.ts` always passes
   * `selectInviteMailer(config)`, so a deployment decides by `SMTP_URL` alone.
   */
  inviteMailer?: InviteMailer;
```

  - change the `registerInviteRoutes` deps object (`:884`) to:

```ts
    {
      pool: deps.pool,
      ingest: deps.ingest,
      serverAppend: deps.serverAppend,
      webOrigin: deps.webOrigin,
      mailer: deps.inviteMailer ?? new LogInviteMailer(() => {}),
      alerter,
    },
```

  (`alerter` is the `const` at `app.ts:430`, already in scope.)

  In `apps/server/src/index.ts`, import `selectInviteMailer` and add `inviteMailer: selectInviteMailer(config),` to `buildApp`'s deps beside `webOrigin` (`:137`).

  In `apps/server/test/helpers/app.ts`:
  - add `inviteMailer?: InviteMailer; alerter?: ErrorAlerter;` to `BuildTestAppOverrides`;
  - pass `inviteMailer: overrides.inviteMailer,` in the deps;
  - add `alerter: overrides.alerter` to BOTH options objects (`:187-190`).

- [ ] **Step 5: Run and watch it pass.**
  - Run the three files, then `test/routes/invites.test.ts` (unchanged: its mints now answer `emailSent: true` through the silent default, and none of its assertions read the body's key set). If a case there asserts the mint body's EXACT key set, extend it with `emailSent` and cite 6.198.
  - Then run `pnpm check:env` and `pnpm --filter @gisik-nokma/server typecheck`.

- [ ] **Step 6: Flip 6.194–6.201. Features.md:**
  - under `Invitations — an address is a claim` (`:546`) append:

    ```markdown
      - ✅ **An email invitation is emailed** (owner ruling 2026-09-29; access plan Task 5; `apps/server/src/invites/invite-mailer.ts`) — after the credential exists the route mails the link, plain text only (the link is the credential), from `INVITE_FROM` (default `MAGIC_LINK_FROM`, production `contact@artsourced.in`), subject "<inviter> invited you to <workspace> on Gisik Nokma", with the role and the IST expiry. `SMTP_URL` unset logs one line without the link. A failed send is logged and alerted and answered `emailSent: false` — never a 500; the phone channel is never mailed. Cases 6.194–6.201.
    ```

- [ ] **Step 7: Commit** as `Access 5: email the invitation (6.194-6.201)`, then work through the mutations.

---

### Task 6: Find an account by exact email, and pull an outsider in as a guest with the assignment

**Files:**
- Create: `apps/server/src/routes/people.ts`.
- Modify: `apps/server/src/app.ts`:
  - register the routes beside `registerInviteRoutes` (`:882`);
  - the limiter branch at `:631` (add the lookup to the invite bucket).
- Modify: `apps/server/src/http/http-origin.ts:157-206` (two entries).
- Test: `apps/server/test/routes/people.test.ts`; `apps/server/test/http/security-middleware.test.ts` (two `PROTECTED` rows, `:180-213`).
- Modify: `test-cases/06-auth-visibility.md`, `Features.md`.

**Interfaces:**
- Produces:
  - `POST /v1/workspaces/:workspaceId/people-lookup`, body `{ email: string }` (minLength 1), answers `200 { user: { userId: string; name: string; email: string; inWorkspace: boolean; role: 'owner'|'admin'|'member'|'guest'|null } | null }`. A non-member gets `404 READ_NOT_FOUND_BODY`.
  - `POST /v1/workspaces/:workspaceId/assign-outsider`, body `{ userId: string; event: object }`. It answers:
    - `200 { result: IngestResult }` when committed;
    - `422 { result: IngestResult }` when refused or invalid;
    - `400 { error: 'bad_request', message }` for a mismatched event;
    - `404` for a non-member caller.
  - Exports: `registerPeopleRoutes`, `lookupPerson`, `NO_ACCOUNT_REASON`, `OUTSIDER_EVENT_MISMATCH_MESSAGE`, `PEOPLE_RULE`.
- Consumes:
  - `checkPermission` and `NAMED_PERSON_NOT_IN_WORKSPACE_REASON` (`permissions/check-permission.ts:1674`, `:181`);
  - `parseEvent` (`@gisik-nokma/domain`);
  - `requireMember` and `READ_NOT_FOUND_BODY` (`read/membership.ts:60`, `:15`);
  - `resolveEffectiveRole`;
  - `ServerAppend` (`routes/invites.ts:34`);
  - `ClientIngest`;
  - `isSyntheticPhoneEmail`.

**The pre-flight is the gate itself, run dry (deviation D5).**
- The outsider is not a member yet, so the real gate answers `NAMED_PERSON_NOT_IN_WORKSPACE_REASON` for a claim that would otherwise pass. The named-person check is the LAST check `checkPermission` reaches on both arms, and `checkVisibilityPermission` is the last pass it runs (`check-permission.ts:1737-1741`). On `ticket.created` the named-person check (`:1382`) runs after the project check (`:1367`). On `ticket.assigned` it (`:1440`) runs after the `canSee` check (`:1398`).
- So a dry `checkPermission` on the caller's own event answers exactly one of three things:
  - `null` — the person is already a member; no grant;
  - the named-person refusal — everything else passed; grant, then submit;
  - any other refusal — answer it; grant nothing.
- No gate rule is restated here.
- What the gate cannot see is the ENGINE's refusals, for example a soft-deleted ticket (`checkTicketLive`). Those arrive after the grant, and the grant is compensated.

Cases, under `## Finding an account, and pulling an outsider in (access plan, W6–W8)`. +15:

```markdown
- ❌ **6.202 — the lookup matches an account's email EXACTLY, case-insensitively and trimmed: `  ANSELMA@Example.TEST ` finds `anselma@example.test`;** control: the answer names that account's id. Mutation: compare without `lower()`.
- ❌ **6.203 — a PARTIAL email finds nothing: `anselma@example` and `anselma` answer `{ user: null }`;** control: the full address finds her. Mutation: `LIKE $1 || '%'`.
- ❌ **6.204 — a match answers exactly `userId, name, email, inWorkspace, role` — nothing else of the account;** control: a stranger's `inWorkspace` is `false` and `role` `null`. Mutation: add `"emailVerified"` to the answer.
- ❌ **6.205 — a caller who is not a member of the workspace gets the shared 404 body, for a real address and a made-up one alike;** control: a GUEST of the workspace may look up (anyone who can assign). Mutation: skip `requireMember`.
- ❌ **6.206 — someone already in the workspace comes back `inWorkspace: true` with their role;** control: a non-member account comes back `false`. Mutation: answer `inWorkspace: false` always.
- ❌ **6.207 — a synthetic phone address never matches, even typed exactly;** control: a real address of an account does. Mutation: remove the `isSyntheticPhoneEmail` guard.
- ❌ **6.208 — a plain MEMBER (not an admin) assigns an outsider: the outsider becomes a GUEST, the ticket is assigned to them, and they then see that ticket and not its sibling;** control: the response is `200` with a `committed` result. Mutation: skip the grant (the assignment is then refused `That person is not in this workspace.`).
- ❌ **6.209 — the same member's stand-alone `membership.granted` of another account, through `POST /v1/events`, is still refused;** control: the outsider door just granted a guest for the same member. Mutation: exempt `membership.granted` with `role: 'guest'` from the admin gate at `check-permission.ts:716`.
- ❌ **6.210 — a `ticket.created` naming the outsider as its birth assignee: guest granted, ticket created and assigned;** control: the ticket's `assignee_id` is the outsider. Mutation: accept only `ticket.assigned` in the type check.
- ❌ **6.211 — a caller the gate would refuse (a member who cannot see an explicit ticket) gets the gate's own refusal and NOTHING is granted — no membership row, no `membership.granted` in the ledger;** control: the refusal's reason is `TICKET_NOT_VISIBLE_REASON`. Mutation: remove the dry pre-flight (the ledger gains a grant and a revoke).
- ❌ **6.212 — a refusal AFTER the grant (the ticket is soft-deleted, which the engine refuses and the gate does not see) is compensated: the ledger holds `membership.granted` then `membership.revoked`, the outsider holds no role, and the answer is the engine's refusal;** control: the answer is `422`. Mutation: drop the compensating revoke.
- ❌ **6.213 — an event that does not name this workspace, this caller as actor, the `userId` as assignee, or a `ticket.created`/`ticket.assigned` type is refused 400 and nothing is appended;** control: the well-formed twin commits. Mutation: drop the assignee-equals-`userId` check.
- ❌ **6.214 — an assignee who is ALREADY a member is not re-granted: a MEMBER stays a member (never demoted to guest) and the assignment commits;** control: no `membership.granted` is appended. Mutation: grant regardless of membership.
- ❌ **6.215 — a `userId` that is no account answers 422 `That person has no account.` and appends nothing;** control: a real account's id proceeds. Mutation: skip the `"user"` existence read.
- ❌ **6.216 — both routes are HTTP-Origin-protected, cookie-authenticated POSTs: each has a `PROTECTED` row and is in the production set (the 13.116 drift guard);** control: a forged-Origin request to each is refused before any session work. Mutation: remove `/v1/workspaces/:workspaceId/assign-outsider` from `HTTP_ORIGIN_PROTECTED_ROUTES`.
```

- [ ] **Step 1: Write the cases.** Guard: +15.

- [ ] **Step 2: Write the failing test** `apps/server/test/routes/people.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { NAMED_PERSON_NOT_IN_WORKSPACE_REASON, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { NO_ACCOUNT_REASON } from '../../src/routes/people.js';
import { canSee } from '../../src/visibility/can-see.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail, signInWithPhone } from '../helpers/session.js';

/**
 * Access plan Task 6 — the exact-email lookup (owner ruling 5) and the outsider
 * door (owner ruling 3, design (b)), cases 6.202–6.215.
 *
 * Accounts are made the product's way — `signInWithEmail` through the real
 * magic-link door — so `"user".email` and `"emailVerified"` are what better-auth
 * writes, not a fixture's guess.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

type Caller = { userId: string; headers: { authorization: string } };
let n = 0;
async function byEmail(email: string): Promise<Caller> {
  const u = await signInWithEmail(app, magic, email);
  return { userId: u.userId, headers: { authorization: `Bearer ${u.token}` } };
}
async function byPhone(): Promise<Caller & { phone: string }> {
  n += 1;
  const phone = `+9190016${String(n).padStart(5, '0')}`;
  const u = await signInWithPhone(app, otp, phone);
  return { userId: u.userId, headers: { authorization: `Bearer ${u.token}` }, phone };
}

async function post(caller: Caller, url: string, payload: unknown) {
  return app.inject({ method: 'POST', url, headers: caller.headers, payload: payload as Record<string, unknown> });
}

async function found(owner: Caller): Promise<string> {
  const res = await post(owner, '/v1/workspaces', { name: 'Convenience Corner' });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

function ev(ws: string, actorId: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent {
  return { id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId, origin: 'web', clientTime: new Date().toISOString() };
}

async function submit(caller: Caller, events: SubmittedEvent[]) {
  const res = await post(caller, '/v1/events', { events });
  return (res.json() as { results: Array<{ status: string; reason?: string }> }).results;
}

/** Joins `who` at `role` the way the product does: an admin's invitation, accepted. */
async function join(owner: Caller, ws: string, who: Caller, role: 'admin' | 'member' | 'guest'): Promise<void> {
  const minted = await post(owner, `/v1/workspaces/${ws}/invites`, { address: `${who.userId}@join.test`, channel: 'phone', role });
  expect(minted.statusCode, minted.body).toBe(201);
  const token = (minted.json() as { url: string }).url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
  const accepted = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: who.headers });
  expect(accepted.statusCode, accepted.body).toBe(200);
}

async function project(owner: Caller, ws: string): Promise<string> {
  const id = newUlid();
  const [r] = await submit(owner, [ev(ws, owner.userId, { kind: 'project', id }, 'project.created', { name: 'Stock' })]);
  expect(r?.status).toBe('committed');
  return id;
}

async function ticket(caller: Caller, ws: string, projectId: string, title: string): Promise<string> {
  const id = newUlid();
  const [r] = await submit(caller, [
    ev(ws, caller.userId, { kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title }),
  ]);
  expect(r?.status, JSON.stringify(r)).toBe('committed');
  return id;
}

async function roleOf(ws: string, userId: string): Promise<string | null> {
  const { rows } = await db.pool.query<{ role: string }>(
    `SELECT role FROM proj_memberships WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
    [ws, userId],
  );
  return rows[0]?.role ?? null;
}

async function membershipEvents(ws: string, userId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    `SELECT type FROM events WHERE workspace_id = $1 AND entity_kind = 'membership' AND payload->>'userId' = $2 ORDER BY workspace_seq`,
    [ws, userId],
  );
  return rows.map((r) => r.type);
}

const lookup = (caller: Caller, ws: string, email: string) => post(caller, `/v1/workspaces/${ws}/people-lookup`, { email });
const outsider = (caller: Caller, ws: string, userId: string, event: SubmittedEvent) =>
  post(caller, `/v1/workspaces/${ws}/assign-outsider`, { userId, event });

describe('6.202–6.207 POST …/people-lookup', () => {
  it('6.202 exact, case-insensitive, trimmed; CONTROL: names that account', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const anselma = await byEmail('anselma@example.test');
    const res = await lookup(owner, ws, '  ANSELMA@Example.TEST ');
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { user: { userId: string } | null }).user?.userId).toBe(anselma.userId);
  });

  it('6.203 a partial email finds nothing; CONTROL: the full one does', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    await byEmail('balti@example.test');
    for (const partial of ['balti@example', 'balti', '@example.test']) {
      expect((await lookup(owner, ws, partial)).json()).toEqual({ user: null });
    }
    expect((await lookup(owner, ws, 'balti@example.test')).json()).not.toEqual({ user: null });
  });

  it('6.204 exactly five fields; CONTROL: a stranger is inWorkspace false, role null', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const dipu = await byEmail('dipu@example.test');
    const { user } = (await lookup(owner, ws, 'dipu@example.test')).json() as { user: Record<string, unknown> };
    expect(Object.keys(user).sort()).toEqual(['email', 'inWorkspace', 'name', 'role', 'userId']);
    expect(user).toMatchObject({ userId: dipu.userId, email: 'dipu@example.test', inWorkspace: false, role: null });
  });

  it('6.205 a non-member gets the shared 404; CONTROL: a guest of the workspace may look up', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const stranger = await byPhone();
    await byEmail('era@example.test');
    for (const email of ['era@example.test', 'nobody@example.test']) {
      const res = await lookup(stranger, ws, email);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual(READ_NOT_FOUND_BODY);
    }
    const guest = await byPhone();
    await join(owner, ws, guest, 'guest');
    expect((await lookup(guest, ws, 'era@example.test')).statusCode).toBe(200);
  });

  it('6.206 a member comes back inWorkspace true with their role; CONTROL: a non-member false', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const fern = await byEmail('fern@example.test');
    await join(owner, ws, fern, 'member');
    await byEmail('gita@example.test');
    expect((await lookup(owner, ws, 'fern@example.test')).json()).toMatchObject({ user: { inWorkspace: true, role: 'member' } });
    expect((await lookup(owner, ws, 'gita@example.test')).json()).toMatchObject({ user: { inWorkspace: false, role: null } });
  });

  it('6.207 a synthetic phone address never matches; CONTROL: a real address does', async () => {
    const owner = await byPhone();
    const ws = await found(owner);
    const phoneUser = await byPhone();
    const { rows } = await db.pool.query<{ email: string }>('SELECT "email" FROM "user" WHERE "id" = $1', [phoneUser.userId]);
    expect((await lookup(owner, ws, rows[0]!.email)).json()).toEqual({ user: null });
    await byEmail('hema@example.test');
    expect((await lookup(owner, ws, 'hema@example.test')).json()).not.toEqual({ user: null });
  });
});

describe('6.208–6.215 POST …/assign-outsider', () => {
  async function scene() {
    const owner = await byPhone();
    const ws = await found(owner);
    const member = await byPhone();
    await join(owner, ws, member, 'member');
    const prj = await project(owner, ws);
    const mine = await ticket(member, ws, prj, 'Count the float');
    const sibling = await ticket(member, ws, prj, 'Order the tent');
    const out = await byEmail(`out-${newUlid().toLowerCase()}@example.test`);
    return { owner, ws, member, prj, mine, sibling, out };
  }
  const assign = (ws: string, actor: Caller, ticketId: string, assigneeId: string) =>
    ev(ws, actor.userId, { kind: 'ticket', id: ticketId }, 'ticket.assigned', { assigneeId });

  it('6.208 a MEMBER pulls an outsider in: guest + assigned, sees that ticket only; CONTROL: 200 committed', async () => {
    const s = await scene();
    const res = await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId));
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { result: { status: string } }).result.status).toBe('committed');
    expect(await roleOf(s.ws, s.out.userId)).toBe('guest');
    expect(await canSee(db.pool, s.out.userId, s.mine)).toBe(true);
    expect(await canSee(db.pool, s.out.userId, s.sibling)).toBe(false);
  });

  it('6.209 the same member’s stand-alone grant is still refused; CONTROL: the door granted one', async () => {
    const s = await scene();
    await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId));
    const other = await byEmail(`other-${newUlid().toLowerCase()}@example.test`);
    const [r] = await submit(s.member, [
      ev(s.ws, s.member.userId, { kind: 'membership', id: `${s.ws}:${other.userId}` }, 'membership.granted', {
        userId: other.userId,
        role: 'guest',
      }),
    ]);
    expect(r?.status).toBe('refused');
    expect(await roleOf(s.ws, other.userId)).toBeNull();
    expect(await roleOf(s.ws, s.out.userId)).toBe('guest');
  });

  it('6.210 a ticket.created naming the outsider: guest granted, ticket born assigned', async () => {
    const s = await scene();
    const id = newUlid();
    const born = ev(s.ws, s.member.userId, { kind: 'ticket', id }, 'ticket.created', {
      typeId: 'task',
      projectId: s.prj,
      parentId: null,
      title: 'Collect the rent',
      assigneeId: s.out.userId,
    });
    const res = await outsider(s.member, s.ws, s.out.userId, born);
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(s.ws, s.out.userId)).toBe('guest');
    const { rows } = await db.pool.query<{ assignee_id: string }>('SELECT assignee_id FROM proj_tickets WHERE ticket_id = $1', [id]);
    expect(rows).toEqual([{ assignee_id: s.out.userId }]);
  });

  it('6.211 a caller the gate refuses gets its refusal and nothing is granted; CONTROL: the reason', async () => {
    const s = await scene();
    // Explicit to the owner alone: the member cannot see it.
    const hidden = await ticket(s.owner, s.ws, s.prj, 'Salary review');
    const [v] = await submit(s.owner, [
      ev(s.ws, s.owner.userId, { kind: 'ticket', id: hidden }, 'visibility.set', { ticketId: hidden, mode: 'explicit', userIds: [s.owner.userId] }),
    ]);
    expect(v?.status).toBe('committed');
    const res = await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, hidden, s.out.userId));
    expect(res.statusCode).toBe(422);
    expect((res.json() as { result: { reason: string } }).result.reason).toBe(TICKET_NOT_VISIBLE_REASON);
    expect(await roleOf(s.ws, s.out.userId)).toBeNull();
    expect(await membershipEvents(s.ws, s.out.userId)).toEqual([]);
  });

  it('6.212 a refusal after the grant is compensated; CONTROL: 422', async () => {
    const s = await scene();
    const [d] = await submit(s.owner, [ev(s.ws, s.owner.userId, { kind: 'ticket', id: s.mine }, 'ticket.deleted', {})]);
    expect(d?.status, JSON.stringify(d)).toBe('committed');
    const res = await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId));
    expect(res.statusCode).toBe(422);
    expect(await roleOf(s.ws, s.out.userId)).toBeNull();
    expect(await membershipEvents(s.ws, s.out.userId)).toEqual(['membership.granted', 'membership.revoked']);
  });

  it('6.213 a mismatched event is 400 and appends nothing; CONTROL: the well-formed twin commits', async () => {
    const s = await scene();
    const good = assign(s.ws, s.member, s.mine, s.out.userId);
    const bad: SubmittedEvent[] = [
      { ...good, id: newUlid(), payload: { assigneeId: s.owner.userId } },
      { ...good, id: newUlid(), actorId: s.owner.userId },
      { ...good, id: newUlid(), workspaceId: newUlid() },
      { ...good, id: newUlid(), type: 'ticket.collaborator_added', payload: { userId: s.out.userId } },
    ];
    for (const event of bad) {
      expect((await outsider(s.member, s.ws, s.out.userId, event)).statusCode, JSON.stringify(event)).toBe(400);
    }
    expect(await membershipEvents(s.ws, s.out.userId)).toEqual([]);
    expect((await outsider(s.member, s.ws, s.out.userId, good)).statusCode).toBe(200);
  });

  it('6.214 an existing member is not re-granted — never demoted; CONTROL: no grant appended', async () => {
    const s = await scene();
    const before = await membershipEvents(s.ws, s.member.userId);
    const res = await outsider(s.owner, s.ws, s.member.userId, assign(s.ws, s.owner, s.sibling, s.member.userId));
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(s.ws, s.member.userId)).toBe('member');
    expect(await membershipEvents(s.ws, s.member.userId)).toEqual(before);
  });

  it('6.215 no such account: 422 and nothing appended; CONTROL: a real account proceeds', async () => {
    const s = await scene();
    const ghost = newUlid();
    const res = await outsider(s.member, s.ws, ghost, assign(s.ws, s.member, s.mine, ghost));
    expect(res.statusCode).toBe(422);
    expect((res.json() as { result: { reason: string } }).result.reason).toBe(NO_ACCOUNT_REASON);
    expect(await membershipEvents(s.ws, ghost)).toEqual([]);
    expect((await outsider(s.member, s.ws, s.out.userId, assign(s.ws, s.member, s.mine, s.out.userId))).statusCode).toBe(200);
  });
});

// The gate's sentence, imported so 6.208's mutation RED names it verbatim.
void NAMED_PERSON_NOT_IN_WORKSPACE_REASON;
```

  Read each helper's assumptions before running:
  - `join` mints a PHONE-channel invitation. The accept door binds whoever holds the link (`routes/invites.ts`, "What acceptance does NOT do"), so the address is irrelevant.
  - `ticket.deleted`'s payload is `{}` (`packages/domain/src/events/ticket-events.ts:301`). The owner may delete: an owner holds project-admin rights (`hasProjectAdminRights`).
  - `ticket.collaborator_added`'s payload is `{ userId }` (`ticket-events.ts:164`).
  - 6.212 relies on the soft-deleted ticket passing the GATE and being refused by the ENGINE (`checkTicketLive`, `packages/rule-engine/src/checks/deletion.ts`). `checkLifecycle`'s per-type switch (`check-lifecycle.ts:172-…`) has no `ticket.assigned` arm, and `canSee` does not read `deleted_at` (`read/visible-where.ts:133-140`). If a run shows the gate refusing it instead, the pre-flight caught it, and 6.212 needs another engine-only refusal. Record which one you used.

  In `apps/server/test/http/security-middleware.test.ts`, add two rows to `PROTECTED` (`:180-213`), each with this comment above it: "Access plan Task 6 (6.216). A cookie-authenticated POST; the lookup answers "does this address have an account", the other GRANTS a role."

```ts
    [
      'the people LOOKUP (access plan, 6.216)',
      '/v1/workspaces/01JQ0000000000000000000000/people-lookup',
      '/v1/workspaces/:workspaceId/people-lookup',
      'POST',
    ],
    [
      'the outsider ASSIGNMENT (access plan, 6.216)',
      '/v1/workspaces/01JQ0000000000000000000000/assign-outsider',
      '/v1/workspaces/:workspaceId/assign-outsider',
      'POST',
    ],
```

- [ ] **Step 3: Run and watch it fail.** `people.test.ts` fails to import `NO_ACCOUNT_REASON` (a compile RED). The security suite's 13.116 fails on set equality (two rows, no production entries).

- [ ] **Step 4: Implement** `apps/server/src/routes/people.ts`:

```ts
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  membershipId,
  newUlid,
  parseEvent,
  type EventEnvelope,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { isSyntheticPhoneEmail } from '../auth/synthetic-address.js';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { checkPermission, NAMED_PERSON_NOT_IN_WORKSPACE_REASON } from '../permissions/check-permission.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import type { ServerAppend } from './invites.js';

/** The refusal for a `userId` that is no account at all (case 6.215). */
export const NO_ACCOUNT_REASON = 'That person has no account.';
export const PEOPLE_RULE = 'people.outsider';
export const OUTSIDER_EVENT_MISMATCH_MESSAGE =
  'The claim must be your own ticket.created or ticket.assigned in this workspace, naming this person as the assignee.';

export type LookedUpPerson = {
  userId: string;
  name: string;
  email: string;
  inWorkspace: boolean;
  role: 'owner' | 'admin' | 'member' | 'guest' | null;
};

/**
 * The ONE account whose REAL email is exactly this address — owner ruling 5
 * (2026-09-29): "have them type up their email, and only show if a user matching
 * that email is found."
 *
 * - EXACT: `lower(email) = lower(trim($1))`. No prefix, no LIKE, no list — a
 *   partial address answers `null` (case 6.203).
 * - VERIFIED only: an address better-auth never verified is not "an account
 *   with that email" (the `my-invitations.ts` rule).
 * - A synthetic phone address never matches (`auth/synthetic-address.ts`),
 *   typed or not: its local part IS a phone number (case 6.207).
 * - TWO case-variant accounts (constructible — `my-invitations.ts` records
 *   why) answer `null` rather than a guess: "the one exact match" does not exist.
 */
export async function lookupPerson(db: Queryable, workspaceId: string, email: string): Promise<LookedUpPerson | null> {
  const wanted = email.trim();
  if (wanted === '' || isSyntheticPhoneEmail(wanted)) return null;
  const { rows } = await db.query<{ id: string; name: string | null; email: string }>(
    `SELECT "id", "name", "email" FROM "user"
      WHERE lower("email") = lower($1) AND "emailVerified" = true
      ORDER BY "id" LIMIT 2`,
    [wanted],
  );
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  if (isSyntheticPhoneEmail(row.email)) return null;
  const eff = await resolveEffectiveRole(db, row.id, workspaceId);
  const name = row.name?.trim() ?? '';
  return {
    userId: row.id,
    name: name === '' ? row.email : name,
    email: row.email,
    inWorkspace: eff.workspaceRole !== null,
    role: eff.workspaceRole,
  };
}

export type PeopleRouteDeps = {
  pool: Queryable;
  ingest: ClientIngest;
  serverAppend: ServerAppend;
};

function refused(eventId: string, reason: string): IngestResult {
  return { status: 'refused', eventId, rule: PEOPLE_RULE, reason };
}

/** The assignee the caller's claim names, or `null` when it names none. */
function assigneeOf(event: SubmittedEvent): string | null {
  const payload = event.payload as { assigneeId?: unknown };
  return typeof payload.assigneeId === 'string' ? payload.assigneeId : null;
}

/**
 * Finding an account, and pulling an outsider in (access plan W6–W8).
 *
 * ## Why a route, and not two events in one batch (deviation D5)
 *
 * `ingestAll` commits each event on its own and no check sees its batch
 * (`../ingest/ingest-service.ts:432-446`), so "a grant paired with an
 * assignment in the same batch" is not a thing a check could recognise. The
 * grant goes through the INTERNAL door (a member may not grant through the
 * client door — `check-permission.ts:716` — and still may not: case 6.209),
 * the caller's own claim through the GATED door as the caller.
 *
 * ## The pre-flight is the gate, dry
 *
 * The outsider is not yet a member, so the real gate answers the named-person
 * refusal for a claim that would otherwise pass: that check is the LAST one on
 * both arms. So a dry `checkPermission` answers null (already a member — no
 * grant), the named-person sentence (grant, then submit) or anything else (the
 * answer; nothing granted, case 6.211). No gate rule is restated here. What the
 * gate cannot see — an engine refusal, e.g. a soft-deleted ticket — arrives
 * after the grant and is compensated with `membership.revoked` (case 6.212).
 */
export function registerPeopleRoutes(
  app: FastifyInstance,
  deps: PeopleRouteDeps,
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Params: { workspaceId: string }; Body: { email: string } }>(
    '/v1/workspaces/:workspaceId/people-lookup',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if ((await requireMember(deps.pool, request.currentUserId, workspaceId)) === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }
      return { user: await lookupPerson(deps.pool, workspaceId, request.body.email) };
    },
  );

  app.post<{ Params: { workspaceId: string }; Body: { userId: string; event: unknown } }>(
    '/v1/workspaces/:workspaceId/assign-outsider',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'event'],
          additionalProperties: false,
          properties: { userId: { type: 'string', minLength: 1 }, event: { type: 'object' } },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const callerId = request.currentUserId;
      const { userId } = request.body;
      if ((await requireMember(deps.pool, callerId, workspaceId)) === null) {
        return reply.status(404).send(READ_NOT_FOUND_BODY);
      }

      const parsed = parseEvent(request.body.event);
      if (
        !parsed.ok ||
        (parsed.event.type !== 'ticket.assigned' && parsed.event.type !== 'ticket.created') ||
        parsed.event.workspaceId !== workspaceId ||
        parsed.event.actorId !== callerId ||
        assigneeOf(parsed.event) !== userId
      ) {
        return reply.status(400).send({ error: 'bad_request', message: OUTSIDER_EVENT_MISMATCH_MESSAGE });
      }
      const event = parsed.event;

      const { rows: account } = await deps.pool.query('SELECT 1 FROM "user" WHERE "id" = $1', [userId]);
      if (account.length === 0) {
        return reply.status(422).send({ result: refused(event.id, NO_ACCOUNT_REASON) });
      }

      const dry: EventEnvelope = { ...event, serverTime: new Date().toISOString(), seq: 0 };
      const preflight = await checkPermission(dry, { db: deps.pool, sessionUserId: callerId });
      const needsGrant = preflight !== null && preflight.reason === NAMED_PERSON_NOT_IN_WORKSPACE_REASON;
      if (preflight !== null && !needsGrant) {
        return reply.status(422).send({
          result: { status: 'refused', eventId: event.id, rule: preflight.rule, reason: preflight.reason } satisfies IngestResult,
        });
      }

      const membership = { kind: 'membership' as const, id: membershipId(workspaceId, userId) };
      const serverEvent = (type: string, payload: unknown): SubmittedEvent => ({
        id: newUlid(),
        workspaceId,
        entity: membership,
        type,
        version: 1,
        payload,
        // The caller's act (they pulled this person in), recorded by the server —
        // the acceptance precedent (`../invites/acceptance.ts:129-149`).
        actorId: callerId,
        origin: 'server',
        clientTime: new Date().toISOString(),
      });

      if (needsGrant) {
        const [granted] = await deps.serverAppend([serverEvent('membership.granted', { userId, role: 'guest' })]);
        if (granted?.status !== 'committed') {
          throw new Error(`assign-outsider could not grant ${userId} in ${workspaceId}: ${JSON.stringify(granted)}`);
        }
      }

      const [result] = await deps.ingest.ingestClientBatch([event], callerId);
      if (result === undefined) throw new Error('ingest returned no result for the outsider assignment');
      if (result.status === 'committed') return reply.status(200).send({ result });

      if (needsGrant) {
        // Compensation (case 6.212). A failure here THROWS — a 500, alerted by
        // the app's error handler — because a guest with no assignment has been
        // left in the workspace and an operator must see it.
        const [revoked] = await deps.serverAppend([serverEvent('membership.revoked', { userId })]);
        if (revoked?.status !== 'committed') {
          throw new Error(`assign-outsider could not revoke ${userId} in ${workspaceId}: ${JSON.stringify(revoked)}`);
        }
      }
      return reply.status(422).send({ result });
    },
  );
}
```

  Check the `Refusal` type's fields (`check-permission.ts`, `refuse`/`refuseWith`): the test file reads `{ refused: true, rule, reason }`. If `rule` is typed wider than `string`, keep the `satisfies IngestResult` line and let `tsc` say so.

  In `apps/server/src/app.ts`:
  - import `registerPeopleRoutes` from `'./routes/people.js'`, and after `registerInviteRoutes(…)` (`:882-886`) add:

    ```ts
      // Access plan Task 6 — the exact-email lookup and the outsider door.
      registerPeopleRoutes(app, { pool: deps.pool, ingest: deps.ingest, serverAppend: deps.serverAppend }, requireSession);
    ```

  - Change the limiter branch at `:631` to:

    ```ts
          } else if (
            method === 'POST' &&
            (routeUrl === '/v1/workspaces/:workspaceId/invites' ||
              // Deviation D9: the lookup answers "does this address have an
              // account" — an address oracle, the same scarcity as minting a
              // credential, so it spends the same budget.
              routeUrl === '/v1/workspaces/:workspaceId/people-lookup')
          ) {
    ```

  In `apps/server/src/http/http-origin.ts`, add before the closing `]);` (`:206`):

```ts
  // Access plan Task 6 (case 6.216). The lookup answers "does this address have
  // an account"; the outsider door GRANTS a workspace role. Both are
  // cookie-authenticated POSTs a page the victim visits could otherwise send.
  '/v1/workspaces/:workspaceId/people-lookup',
  '/v1/workspaces/:workspaceId/assign-outsider',
```

- [ ] **Step 5: Run and watch it pass.** Run `people.test.ts` and `test/http/security-middleware.test.ts`, including 13.116 and 13.198. Then run the whole server suite.

- [ ] **Step 6: Flip 6.202–6.216. Features.md:** append at the end of `## 6.`:

    ```markdown
    - ✅ **Find an account by its exact email, and pull an outsider in as a guest with the assignment** (owner rulings 2026-09-29; access plan Task 6; `apps/server/src/routes/people.ts`) — `POST /v1/workspaces/:id/people-lookup {email}` answers the ONE verified account whose email matches exactly (case-insensitive, trimmed; no prefix, no list; a synthetic phone address never matches) as `{userId, name, email, inWorkspace, role}` or `null`, to any workspace member. `POST /v1/workspaces/:id/assign-outsider {userId, event}` takes the caller's own `ticket.created`/`ticket.assigned` naming that person: the gate is run dry first (its own refusal is answered and nothing granted), then `membership.granted {role: 'guest'}` goes through the internal door and the claim through the gated door as the caller; a refusal after the grant is compensated with `membership.revoked`. Anyone who may assign may pull someone in, only as a guest, only with an assignment — a stand-alone grant is still admin-only. Both routes are HTTP-Origin protected; the lookup spends the invite rate-limit budget. Cases 6.202–6.216.
    ```

- [ ] **Step 7: Commit** as `Access 6: exact-email lookup and the outsider door (6.202-6.216)`, then work through the mutations.

---
### Task 7: `app-core` — the people gateway, the outsider finder, and the outsider arm on the dialog, the flow and the sheet

> Invoke `ui-ux-pro-max` beside the workflow skill for this task. The status and focus decisions are pinned in Global Constraints → Design.

**Files:**
- Create: `packages/app-core/src/people/types.ts`, `packages/app-core/src/people/copy.ts`, `packages/app-core/src/people/outsider-ingest.ts`, `packages/app-core/src/online/people.ts`, `packages/app-core/src/views/outsider-finder.tsx`.
- Modify:
  - `packages/app-core/src/online/invites-admin.ts`: `MintedInvite` (`:15`) and the mint mapper (`:136-145`).
  - `packages/app-core/src/online/index.ts`: export the gateway.
  - `packages/app-core/src/index.ts`: export `people/*` and `OutsiderFinder`.
- Modify: `packages/app-core/src/views/new-ticket-dialog.tsx`:
  - `NewTicketDraft` (after `assigneeId`, `:142`);
  - the props type (after `assigneeCandidatesUnavailable`, `:320`);
  - the signature (`:407-423`);
  - the assignee state (`:743`);
  - the draft's `assigneeId` (`:851-855`);
  - the picker (`:1249-1283`).
- Modify: `packages/app-core/src/views/create-ticket-flow.tsx`:
  - the props type (`:20-…`);
  - the signature (`:160-179`);
  - the submit (`:376`).
- Modify: `packages/app-core/src/views/ticket-sheet.tsx`:
  - the props type (`:174-…`);
  - `submitAssignee` (`:1258-1273`);
  - `assigneeRow` (`:2669-2735`).
- Test:
  - `packages/app-core/test/online/people.test.ts`;
  - `packages/app-core/test/views/outsider-finder.test.tsx`;
  - `packages/app-core/test/views/outsider-assign.test.tsx`;
  - `packages/app-core/test/views/ticket-sheet.test.tsx` (existing — one describe appended after 13.968's, `:1697-…`);
  - `packages/app-core/test/online/invites-admin.test.ts` (existing — `MINTED` gains `emailSent`).
- Modify: `test-cases/03-foundation-ledger.md`, `Features.md`.

**Interfaces:**
- Produces (`people/types.ts`):
  - `type LookedUpPerson = { userId: string; name: string; email: string; inWorkspace: boolean; role: 'owner'|'admin'|'member'|'guest'|null }`;
  - `type LookupPerson = (email: string) => Promise<LookedUpPerson | null>`;
  - `type AssignOutsider = (userId: string, event: SubmittedEvent) => Promise<IngestResult>`.
- Produces (`online/people.ts`):
  - `type PeopleGateway = { lookup(workspaceId: string, email: string): Promise<LookedUpPerson | null>; assignOutsider(workspaceId: string, userId: string, event: SubmittedEvent): Promise<IngestResult> }`;
  - `createHttpPeopleGateway(http: HttpClient): PeopleGateway`;
  - `class PeopleLookupError(status, serverMessage)`.
- Produces (`people/outsider-ingest.ts`): `outsiderIngest(assignOutsider: AssignOutsider, userId: string): DataSource['ingest']`.
- Produces (`views/outsider-finder.tsx`): `OutsiderFinder({ lookup, onPick, onCancel })`.
- New optional props:
  - `NewTicketDialogProps.lookupPerson?: LookupPerson`;
  - `NewTicketDraft.assigneeIsOutsider?: true`;
  - `CreateTicketFlowProps.lookupPerson?: LookupPerson`, `CreateTicketFlowProps.assignOutsider?: AssignOutsider`;
  - `TicketSheetProps.lookupPerson?: LookupPerson`, `TicketSheetProps.assignOutsider?: AssignOutsider`.

  Every one is ABSENT by default, and absent renders exactly what renders today. The existing cases 13.968 and 13.1367–13.1370 are the regression witness.
- Produces: `MintedInvite.emailSent: boolean`, REQUIRED. The mapper refuses a mint answer without it, the same all-or-none rule it applies to `expiresAt` (`invites-admin.ts:140-144`).
- Consumes: Task 6's routes (bodies and statuses above), and Task 5's `emailSent`.

**Why the outsider ingest is a wrapper and not a new submit path.** `CreateTicketFlow` sends through `submitChildEvent(dataSource, childEvent)` (`create-ticket-flow.tsx:376`), which reads its answer from `dataSource.ingest`. Handing it `{ ...dataSource, ingest: outsiderIngest(assignOutsider, userId) }` routes ONE claim through the outsider door and keeps every outcome branch below it (`committed`, `invalid`, `refused`, `needs-reopen`) exactly as written.
- **Recorded residual (D11).** The reopen path (`acceptReopen`, `:399-…`) is left on the plain `dataSource`. An outsider birth assignee on a child of a CLOSED parent gets the named-person refusal after the reopen, and the person can pick them again. Recorded, not built.

Cases, under `## People: the outsider arm and the invitation result (access plan, 2026-09-29)` in `03-foundation-ledger.md`. +9:

```markdown
- ❌ **3.982 — `PeopleGateway.lookup` POSTs `{email}` to `…/people-lookup` and maps `{user}` to a `LookedUpPerson` or `null`; a 404 throws `PeopleLookupError` carrying the status;** control: `{ user: null }` maps to `null`, not an error. Mutation: map a 404 to `null`.
- ❌ **3.983 — `PeopleGateway.assignOutsider` POSTs `{userId, event}` and returns the `IngestResult` for a 200 AND for a 422 (a refusal is an answer, not an error);** control: a 400 throws with the server's message. Mutation: throw on 422.
- ❌ **3.984 — `OutsiderFinder`: typing an address and pressing Find (or Enter) shows `<name> (<email>)` with **Assign**, focus moves to Assign, and pressing it hands the person to `onPick`;** control: the lookup was called with the trimmed address. Mutation: call `onPick` without the person.
- ❌ **3.985 — `OutsiderFinder`: no match says `No user with that email.` as a status, and offers no Assign;** control: a failed lookup says so as an alert with the reason. Mutation: render the not-found line as an empty status.
- ❌ **3.986 — `OutsiderFinder`: a match who is already in the workspace is labelled `<name> is already in this workspace.` and is still pickable;** control: an outsider's line says they join as a guest. Mutation: drop the `inWorkspace` branch.
- ❌ **3.987 — the New ticket dialog offers `Assign someone outside this workspace…` only when `lookupPerson` is given, and a found outsider leaves in the draft as `assigneeId` with `assigneeIsOutsider: true`;** control: without the prop the options are unchanged, and a member pick carries no `assigneeIsOutsider` key. Mutation: always set `assigneeIsOutsider`.
- ❌ **3.988 — `CreateTicketFlow` sends an outsider draft's `ticket.created` through `assignOutsider(userId, event)` and NOT `dataSource.ingest`;** control: a member draft goes through `dataSource.ingest` and never calls `assignOutsider`. Mutation: ignore `assigneeIsOutsider`.
- ❌ **3.989 — the ticket sheet offers the outsider arm when given `lookupPerson`, and picking a found outsider sends `ticket.assigned` through `assignOutsider`, not `dataSource.ingest`;** control: a found person who is ALREADY in the workspace goes through `dataSource.ingest`. Mutation: route every pick through `assignOutsider`.
- ❌ **3.990 — the sheet shows `assignOutsider`'s refusal verbatim, as it shows an ingest refusal;** control: a committed answer shows no refusal. Mutation: drop the refused branch of the outsider submit.
```

- [ ] **Step 1: Write the cases.** Guard: +9.

- [ ] **Step 2: Write the failing tests.**

`packages/app-core/test/online/people.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { HttpError, type HttpClient } from '../../src/online/http.js';
import { createHttpPeopleGateway, PeopleLookupError } from '../../src/online/people.js';

/** Access plan Task 7, cases 3.982–3.983. */

type Call = { method: string; path: string; body?: unknown };
function fakeHttp(answer: (path: string, body: unknown) => unknown): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    get: async (path) => {
      calls.push({ method: 'GET', path });
      return answer(path, undefined);
    },
    post: async (path, body) => {
      calls.push({ method: 'POST', path, body });
      const value = answer(path, body);
      if (value instanceof Error) throw value;
      return value;
    },
    put: async () => undefined,
    del: async () => undefined,
  } as HttpClient & { calls: Call[] };
}

const PERSON = { userId: '01J9USER000000000000000000', name: 'Anselma Marak', email: 'anselma@example.test', inWorkspace: false, role: null };
const EVENT = { id: '01J9EVT0000000000000000000', type: 'ticket.assigned' } as unknown as SubmittedEvent;

describe('3.982 lookup', () => {
  it('3.982 POSTs {email}, maps the person or null; a 404 throws with its status', async () => {
    const http = fakeHttp((_p, body) => ((body as { email: string }).email === 'anselma@example.test' ? { user: PERSON } : { user: null }));
    const people = createHttpPeopleGateway(http);
    expect(await people.lookup('ws_1', 'anselma@example.test')).toEqual(PERSON);
    expect(http.calls[0]).toEqual({ method: 'POST', path: '/v1/workspaces/ws_1/people-lookup', body: { email: 'anselma@example.test' } });
    expect(await people.lookup('ws_1', 'nobody@example.test')).toBeNull();

    const refusing = createHttpPeopleGateway(fakeHttp(() => new HttpError(404, '/v1/workspaces/ws_1/people-lookup', { error: 'not_found' })));
    await expect(refusing.lookup('ws_1', 'a@b.test')).rejects.toMatchObject({ name: 'PeopleLookupError', status: 404 });
    await expect(refusing.lookup('ws_1', 'a@b.test')).rejects.toBeInstanceOf(PeopleLookupError);
  });
});

describe('3.983 assignOutsider', () => {
  it('3.983 returns the IngestResult for 200 and for 422; a 400 throws with the message', async () => {
    const committed = { status: 'committed', eventId: EVENT.id, seq: 1, serverTime: '2026-09-29T10:00:00.000Z' };
    const refused = { status: 'refused', eventId: EVENT.id, rule: 'people.outsider', reason: 'That person has no account.' };
    const ok = createHttpPeopleGateway(fakeHttp(() => ({ result: committed })));
    expect(await ok.assignOutsider('ws_1', PERSON.userId, EVENT)).toEqual(committed);

    const no = createHttpPeopleGateway(fakeHttp(() => new HttpError(422, '/x', { result: refused })));
    expect(await no.assignOutsider('ws_1', PERSON.userId, EVENT)).toEqual(refused);

    const bad = createHttpPeopleGateway(
      fakeHttp(() => new HttpError(400, '/x', { error: 'bad_request', message: 'The claim must be your own…' })),
    );
    await expect(bad.assignOutsider('ws_1', PERSON.userId, EVENT)).rejects.toThrow('The claim must be your own…');
  });
});
```

  Match `fakeHttp`'s member set to `HttpClient`'s actual type. The invites-admin test's fake (`test/online/invites-admin.test.ts:10-25`) carries `get`, `post`, `put` and `del`. Mirror it.

`packages/app-core/test/views/outsider-finder.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  alreadyInWorkspaceLine,
  OUTSIDER_ASSIGN,
  OUTSIDER_EMAIL_LABEL,
  OUTSIDER_FIND,
  OUTSIDER_JOINS_AS_GUEST,
  OUTSIDER_NOT_FOUND,
  foundLine,
  lookupFailedLine,
} from '../../src/people/copy.js';
import { OutsiderFinder } from '../../src/views/outsider-finder.js';

/** Access plan Task 7, cases 3.984–3.986. The copy's literal pins live here (the "pinned once" rule). */

const OUT = { userId: 'u_out', name: 'Anselma Marak', email: 'anselma@example.test', inWorkspace: false, role: null } as const;
const IN = { userId: 'u_in', name: 'Balti Sangma', email: 'balti@example.test', inWorkspace: true, role: 'member' } as const;

describe('3.984–3.986 OutsiderFinder', () => {
  it('pins its copy literally, once', () => {
    expect(OUTSIDER_EMAIL_LABEL).toBe('Their email');
    expect(OUTSIDER_FIND).toBe('Find');
    expect(OUTSIDER_ASSIGN).toBe('Assign');
    expect(OUTSIDER_NOT_FOUND).toBe('No user with that email.');
    expect(OUTSIDER_JOINS_AS_GUEST).toBe('They will join this workspace as a guest and see only this ticket.');
    expect(foundLine(OUT)).toBe('Anselma Marak (anselma@example.test)');
    expect(alreadyInWorkspaceLine('Balti Sangma')).toBe('Balti Sangma is already in this workspace.');
    expect(lookupFailedLine('HTTP 500')).toBe('The lookup failed: HTTP 500');
  });

  it('3.984 Find shows the person, focuses Assign, and Assign hands them over; CONTROL: the lookup got the trimmed address', async () => {
    const user = userEvent.setup();
    const lookup = vi.fn(async () => OUT);
    const onPick = vi.fn();
    render(<OutsiderFinder lookup={lookup} onPick={onPick} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), '  anselma@example.test  ');
    await user.click(screen.getByRole('button', { name: OUTSIDER_FIND }));
    expect(await screen.findByText(foundLine(OUT))).toBeInTheDocument();
    expect(screen.getByText(OUTSIDER_JOINS_AS_GUEST)).toBeInTheDocument();
    const assign = screen.getByRole('button', { name: OUTSIDER_ASSIGN });
    await waitFor(() => expect(assign).toHaveFocus());
    expect(lookup).toHaveBeenCalledWith('anselma@example.test');
    await user.click(assign);
    expect(onPick).toHaveBeenCalledWith(OUT);
  });

  it('3.984 Enter in the field runs Find', async () => {
    const user = userEvent.setup();
    const lookup = vi.fn(async () => OUT);
    render(<OutsiderFinder lookup={lookup} onPick={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'anselma@example.test{Enter}');
    expect(await screen.findByText(foundLine(OUT))).toBeInTheDocument();
  });

  it('3.985 no match is a status and offers no Assign; CONTROL: a failed lookup is an alert with the reason', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OutsiderFinder lookup={async () => null} onPick={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'nobody@example.test{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent(OUTSIDER_NOT_FOUND);
    expect(screen.queryByRole('button', { name: OUTSIDER_ASSIGN })).toBeNull();
    unmount();

    render(
      <OutsiderFinder lookup={async () => Promise.reject(new Error('HTTP 500'))} onPick={() => undefined} onCancel={() => undefined} />,
    );
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'x@example.test{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(lookupFailedLine('HTTP 500'));
  });

  it('3.986 an existing member is labelled as one and still pickable; CONTROL: an outsider joins as a guest', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<OutsiderFinder lookup={async () => IN} onPick={onPick} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'balti@example.test{Enter}');
    expect(await screen.findByText(alreadyInWorkspaceLine('Balti Sangma'))).toBeInTheDocument();
    expect(screen.queryByText(OUTSIDER_JOINS_AS_GUEST)).toBeNull();
    await user.click(screen.getByRole('button', { name: OUTSIDER_ASSIGN }));
    expect(onPick).toHaveBeenCalledWith(IN);
  });
});
```

`packages/app-core/test/views/outsider-assign.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { ASSIGN_OUTSIDER_OPTION, OUTSIDER_ASSIGN, OUTSIDER_EMAIL_LABEL } from '../../src/people/copy.js';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import { NewTicketDialog } from '../../src/views/new-ticket-dialog.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/** Access plan Task 7, cases 3.987–3.988. */

const PEOPLE = [{ id: 'user_anselma', name: 'Anselma Marak' }];
const OUT = { userId: 'user_out', name: 'Era Momin', email: 'era@example.test', inWorkspace: false, role: null } as const;

async function pickOutsider(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
  await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: ASSIGN_OUTSIDER_OPTION }));
  await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'era@example.test{Enter}');
  await user.click(await screen.findByRole('button', { name: OUTSIDER_ASSIGN }));
}

describe('3.987 the dialog’s outsider arm', () => {
  const props = {
    open: true,
    userId: 'usr_ada',
    workspaceId: 'ws_1',
    typeOptions: [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }],
    parentCandidates: [],
    assigneeCandidates: PEOPLE,
    workflowStates: () => null,
    onClose: () => undefined,
  };

  it('3.987 the option exists only with lookupPerson; an outsider leaves as assigneeIsOutsider', async () => {
    const user = userEvent.setup();
    const bare = render(<NewTicketDialog {...props} onCreate={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    expect(within(await screen.findByRole('listbox')).queryByRole('option', { name: ASSIGN_OUTSIDER_OPTION })).toBeNull();
    bare.unmount();

    const onCreate = vi.fn();
    render(<NewTicketDialog {...props} lookupPerson={async () => OUT} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await pickOutsider(user);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'user_out', assigneeIsOutsider: true }));
  });

  it('3.987 CONTROL: a member pick carries no assigneeIsOutsider key', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTicketDialog {...props} lookupPerson={async () => OUT} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Anselma Marak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty('assigneeIsOutsider');
  });
});

describe('3.988 the flow routes an outsider draft through assignOutsider', () => {
  function renderFlow(assignOutsider: (userId: string, event: SubmittedEvent) => Promise<IngestResult>) {
    const source = createFakeDataSource();
    render(
      <CreateTicketFlow
        dataSource={source}
        workspaceId={WS}
        projectId="01J9GPRJ000000000000000000"
        currentUserId="user_kiro"
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        workflowStates={() => null}
        parentCandidates={[]}
        assigneeCandidates={PEOPLE}
        lookupPerson={async () => OUT}
        assignOutsider={assignOutsider}
        onCreated={() => undefined}
      />,
    );
    return source;
  }

  it('3.988 the outsider’s ticket.created goes to assignOutsider, not ingest', async () => {
    const user = userEvent.setup();
    const assignOutsider = vi.fn(async (_u: string, e: SubmittedEvent): Promise<IngestResult> => ({
      status: 'committed',
      eventId: e.id,
      seq: 1,
      serverTime: '2026-09-29T10:00:00.000Z',
    }));
    const source = renderFlow(assignOutsider);
    await user.click(screen.getByRole('button', { name: 'New ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await pickOutsider(user);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await vi.waitFor(() => expect(assignOutsider).toHaveBeenCalledTimes(1));
    const [userId, event] = assignOutsider.mock.calls[0]!;
    expect(userId).toBe('user_out');
    expect(event).toMatchObject({ type: 'ticket.created', payload: expect.objectContaining({ assigneeId: 'user_out' }) });
    expect(source.ingested).toHaveLength(0);
  });

  it('3.988 CONTROL: a member draft goes through ingest', async () => {
    const user = userEvent.setup();
    const assignOutsider = vi.fn();
    const source = renderFlow(assignOutsider);
    await user.click(screen.getByRole('button', { name: 'New ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Anselma Marak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await vi.waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(assignOutsider).not.toHaveBeenCalled();
  });
});
```

  Append to `packages/app-core/test/views/ticket-sheet.test.tsx`, after 13.968's describe. It reuses `renderSheet`, `sheetSource`, `ticketRead` and `settled` (`:52-160`) and 13.968's `openAssigneeList` pattern:

```tsx
describe('3.989–3.990 the sheet’s outsider arm (access plan Task 7)', () => {
  const OUT = { userId: 'user_out', name: 'Era Momin', email: 'era@example.test', inWorkspace: false, role: null } as const;
  const ANSELMA = { userId: 'user_anselma', name: 'Anselma Marak', email: 'anselma@example.test', inWorkspace: true, role: 'member' } as const;

  async function pickVia(finderAnswer: typeof OUT | typeof ANSELMA): Promise<void> {
    const row = screen.getByTestId('field-assignee');
    await userEvent.click(within(row).getByRole('button'));
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: ASSIGN_OUTSIDER_OPTION }));
    await userEvent.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), `${finderAnswer.email}{Enter}`);
    await userEvent.click(await screen.findByRole('button', { name: OUTSIDER_ASSIGN }));
  }

  it('3.989 an outsider pick sends ticket.assigned through assignOutsider; CONTROL: a member found goes through ingest', async () => {
    const assignOutsider = vi.fn(async (_u: string, e: SubmittedEvent): Promise<IngestResult> => ({
      status: 'committed',
      eventId: e.id,
      seq: 2,
      serverTime: '2026-09-29T10:00:00.000Z',
    }));
    const source = renderSheet(ticketRead(), sheetSource(ticketRead()), { lookupPerson: async () => OUT, assignOutsider });
    await settled();
    await pickVia(OUT);
    await waitFor(() => expect(assignOutsider).toHaveBeenCalledTimes(1));
    expect(assignOutsider.mock.calls[0]![0]).toBe('user_out');
    expect(assignOutsider.mock.calls[0]![1]).toMatchObject({ type: 'ticket.assigned', payload: { assigneeId: 'user_out' } });
    expect(source.ingested).toHaveLength(0);
  });

  it('3.989 CONTROL: someone already in the workspace goes through the ordinary door', async () => {
    const assignOutsider = vi.fn();
    const source = renderSheet(ticketRead(), sheetSource(ticketRead()), { lookupPerson: async () => ANSELMA, assignOutsider });
    await settled();
    await pickVia(ANSELMA);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(assignOutsider).not.toHaveBeenCalled();
  });

  it('3.990 the outsider door’s refusal is shown verbatim; CONTROL: none on commit', async () => {
    const reason = 'That person has no account.';
    renderSheet(ticketRead(), sheetSource(ticketRead()), {
      lookupPerson: async () => OUT,
      assignOutsider: async (_u, e) => ({ status: 'refused', eventId: e.id, rule: 'people.outsider', reason }),
    });
    await settled();
    await pickVia(OUT);
    expect(await screen.findByText(reason, { exact: false })).toBeInTheDocument();
  });
});
```

  Add the imports this block needs to that file:
  - `ASSIGN_OUTSIDER_OPTION, OUTSIDER_ASSIGN, OUTSIDER_EMAIL_LABEL` from `'../../src/people/copy.js'`;
  - `type IngestResult, type SubmittedEvent` from `'@gisik-nokma/domain'`, if they are not already imported.

  3.990's control half is 3.989's first case, which renders no refusal after a commit. Read how the sheet renders `serverRefusal` (the refusal block near its footer) and assert its role/class if it has one.

  In `packages/app-core/test/online/invites-admin.test.ts`, add `emailSent: true` to `MINTED` (`:27-31`). Then add one `it` to its 3.95 describe:

  > `'3.95 AMENDED (W5): a mint answer without emailSent is refused like one without expiresAt'`

  It answers `{ inviteId, url, expiresAt }` and expects `InviteAdminError`.

- [ ] **Step 3: Run and watch it fail.** `pnpm turbo run build`, then `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/online/people.test.ts test/views/outsider-finder.test.tsx test/views/outsider-assign.test.tsx test/views/ticket-sheet.test.tsx test/online/invites-admin.test.ts > /tmp/access-app-core.log 2>&1; tail -30 /tmp/access-app-core.log`.
  - Expected: the three new files fail to import (compile RED);
  - the sheet block fails (no outsider option);
  - the amended invites-admin case fails (the mapper accepts it).

- [ ] **Step 4: Implement.**

`packages/app-core/src/people/types.ts`:

```ts
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';

/** One account found by its EXACT email (`POST /v1/workspaces/:id/people-lookup`, access plan W7). */
export type LookedUpPerson = {
  userId: string;
  name: string;
  email: string;
  inWorkspace: boolean;
  role: 'owner' | 'admin' | 'member' | 'guest' | null;
};

export type LookupPerson = (email: string) => Promise<LookedUpPerson | null>;

/** The outsider door (W6): the caller's own claim, answered as the claim's `IngestResult`. */
export type AssignOutsider = (userId: string, event: SubmittedEvent) => Promise<IngestResult>;
```

`packages/app-core/src/people/copy.ts`:

```ts
import type { LookedUpPerson } from './types.js';

/** Every string the outsider arm shows (access plan Task 7). Pinned literally once, by `outsider-finder.test.tsx`. */
export const ASSIGN_OUTSIDER_OPTION = 'Assign someone outside this workspace…';
export const OUTSIDER_EMAIL_LABEL = 'Their email';
export const OUTSIDER_FIND = 'Find';
export const OUTSIDER_CANCEL = 'Cancel';
export const OUTSIDER_ASSIGN = 'Assign';
export const OUTSIDER_NOT_FOUND = 'No user with that email.';
export const OUTSIDER_JOINS_AS_GUEST = 'They will join this workspace as a guest and see only this ticket.';

export function foundLine(person: Pick<LookedUpPerson, 'name' | 'email'>): string {
  return `${person.name} (${person.email})`;
}

export function alreadyInWorkspaceLine(name: string): string {
  return `${name} is already in this workspace.`;
}

export function lookupFailedLine(why: string): string {
  return `The lookup failed: ${why}`;
}
```

`packages/app-core/src/people/outsider-ingest.ts`:

```ts
import type { DataSource } from '../data-source.js';
import type { AssignOutsider } from './types.js';

/**
 * A `DataSource['ingest']` that sends its ONE claim through the outsider door
 * (access plan W6). Handed to the existing submit machinery in place of
 * `dataSource.ingest`, so every outcome branch the caller already renders —
 * committed, refused, invalid — is reached unchanged. More than one claim is a
 * programming error: the door takes exactly the assignment.
 */
export function outsiderIngest(assignOutsider: AssignOutsider, userId: string): DataSource['ingest'] {
  return async (events) => {
    if (events.length !== 1) {
      throw new Error(`the outsider door takes exactly one claim, got ${events.length}`);
    }
    return [await assignOutsider(userId, events[0]!)];
  };
}
```

`packages/app-core/src/online/people.ts`:

```ts
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { LookedUpPerson } from '../people/types.js';
import { HttpError, refusalText, type HttpClient } from './http.js';

/** A people door refused, with its status and the server's own words. */
export class PeopleLookupError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  constructor(status: number, serverMessage: string | null) {
    super(serverMessage ?? `HTTP ${status} from a people door`);
    this.name = 'PeopleLookupError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

export type PeopleGateway = {
  lookup(workspaceId: string, email: string): Promise<LookedUpPerson | null>;
  assignOutsider(workspaceId: string, userId: string, event: SubmittedEvent): Promise<IngestResult>;
};

function isIngestResult(value: unknown): value is IngestResult {
  return typeof value === 'object' && value !== null && typeof (value as { status?: unknown }).status === 'string';
}

/**
 * The two access-plan doors (Task 6):
 * `POST /v1/workspaces/:id/people-lookup` and `…/assign-outsider`. A 422 from
 * the second IS an answer (the claim's own refusal) and is returned, never
 * thrown — the caller renders it where the control is, as it renders an ingest
 * refusal.
 */
export function createHttpPeopleGateway(http: HttpClient): PeopleGateway {
  const base = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
  return {
    async lookup(workspaceId, email) {
      let raw: unknown;
      try {
        raw = await http.post(`${base(workspaceId)}/people-lookup`, { email });
      } catch (cause) {
        if (cause instanceof HttpError) throw new PeopleLookupError(cause.status, refusalText(cause.body));
        throw cause;
      }
      const user = (raw as { user?: unknown } | null)?.user;
      return user === null || user === undefined ? null : (user as LookedUpPerson);
    },

    async assignOutsider(workspaceId, userId, event) {
      let raw: unknown;
      try {
        raw = await http.post(`${base(workspaceId)}/assign-outsider`, { userId, event });
      } catch (cause) {
        if (cause instanceof HttpError) {
          const result = (cause.body as { result?: unknown } | undefined)?.result;
          if (cause.status === 422 && isIngestResult(result)) return result;
          throw new PeopleLookupError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      const result = (raw as { result?: unknown } | null)?.result;
      if (!isIngestResult(result)) throw new PeopleLookupError(200, null);
      return result;
    },
  };
}
```

  Export `createHttpPeopleGateway`, `PeopleLookupError` and `type PeopleGateway` from `packages/app-core/src/online/index.ts`, beside the invites-admin exports (`:43`).

  Export `outsiderIngest`, the three `people/types` types, `OutsiderFinder` and every constant/function in `people/copy.ts` from `packages/app-core/src/index.ts`.

`packages/app-core/src/views/outsider-finder.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import {
  OUTSIDER_ASSIGN,
  OUTSIDER_CANCEL,
  OUTSIDER_EMAIL_LABEL,
  OUTSIDER_FIND,
  OUTSIDER_JOINS_AS_GUEST,
  OUTSIDER_NOT_FOUND,
  alreadyInWorkspaceLine,
  foundLine,
  lookupFailedLine,
} from '../people/copy.js';
import type { LookedUpPerson, LookupPerson } from '../people/types.js';

type FinderState =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'found'; person: LookedUpPerson }
  | { kind: 'none' }
  | { kind: 'failed'; why: string };

/**
 * Find ONE account by its exact email and hand it back (owner ruling
 * 2026-09-29: "have them type up their email, and only show if a user matching
 * that email is found"). Nothing is listed; nothing is suggested while typing.
 *
 * A status for "found"/"not found" (the answer to what the person just asked),
 * an alert only for a failed lookup (the product could not answer). Focus moves
 * to Assign when someone is found, so Enter-Enter assigns; it stays in the field
 * when nobody is, so the person can correct the address.
 *
 * NOT a `<form>`: this renders inside the New ticket dialog and the ticket
 * sheet, whose own controls must not be submitted by Enter here.
 */
export function OutsiderFinder({
  lookup,
  onPick,
  onCancel,
}: {
  lookup: LookupPerson;
  onPick: (person: LookedUpPerson) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FinderState>({ kind: 'idle' });
  const assignRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (state.kind === 'found') assignRef.current?.focus();
  }, [state]);

  const find = async (): Promise<void> => {
    const wanted = email.trim();
    if (wanted === '') return;
    setState({ kind: 'looking' });
    try {
      const person = await lookup(wanted);
      setState(person === null ? { kind: 'none' } : { kind: 'found', person });
    } catch (cause) {
      setState({ kind: 'failed', why: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  return (
    <div className="gn-outsider-finder">
      <label className="gn-field" htmlFor={inputId}>
        <span className="gn-field__label">{OUTSIDER_EMAIL_LABEL}</span>
        <input
          id={inputId}
          type="email"
          className="gn-field__input"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setState({ kind: 'idle' });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void find();
            }
          }}
        />
      </label>
      <div className="gn-outsider-finder__actions">
        <Button type="button" onClick={() => void find()} disabled={state.kind === 'looking'}>
          {OUTSIDER_FIND}
        </Button>
        <Button type="button" onClick={onCancel}>
          {OUTSIDER_CANCEL}
        </Button>
      </div>
      {state.kind === 'none' ? <p role="status">{OUTSIDER_NOT_FOUND}</p> : null}
      {state.kind === 'failed' ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {lookupFailedLine(state.why)}
        </p>
      ) : null}
      {state.kind === 'found' ? (
        <div role="status" className="gn-outsider-finder__found">
          <p>{foundLine(state.person)}</p>
          <p>{state.person.inWorkspace ? alreadyInWorkspaceLine(state.person.name) : OUTSIDER_JOINS_AS_GUEST}</p>
          <Button ref={assignRef} type="button" variant="primary" onClick={() => onPick(state.person)}>
            {OUTSIDER_ASSIGN}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

`packages/app-core/src/views/new-ticket-dialog.tsx`:
- **`NewTicketDraft`**, after `assigneeId` (`:142`):

```ts
  /**
   * `true` when `assigneeId` names someone OUTSIDER to this workspace, found by
   * exact email (access plan W6). ABSENT otherwise — never `false` — so a draft
   * with a member assignee is byte-identical to one before this field existed.
   * `CreateTicketFlow` reads it to send the claim through the outsider door.
   */
  assigneeIsOutsider?: true;
```

- **Props**, after `assigneeCandidatesUnavailable?` (`:320`):

```ts
  /**
   * The exact-email lookup (access plan W7). Present → the picker gains
   * `ASSIGN_OUTSIDER_OPTION`; absent → the picker is exactly the roster, as
   * before.
   */
  lookupPerson?: LookupPerson;
```

- Add `lookupPerson` to the destructured signature.
- Below `const [assigneeId, setAssigneeId] = …` (`:743`):

```tsx
  /** The outsider found by exact email, if one was picked. Drawn as an option so the picker can STATE the value. */
  const [outsider, setOutsider] = useState<LookedUpPerson | null>(null);
  const [findingOutsider, setFindingOutsider] = useState(false);
```

- **The draft's `assigneeId` block** (`:851-855`) keeps its expression. Directly after it, add:

```tsx
        ...(assigneeCandidatesUnavailable === undefined &&
        outsider !== null &&
        !outsider.inWorkspace &&
        assigneeId === outsider.userId
          ? { assigneeIsOutsider: true as const }
          : {}),
```

- **The picker's `options`** (`:1253-1266`): after the roster's `...assigneeCandidates.map(…)`, append:

```tsx
              ...(outsider !== null && !assigneeCandidates.some((person) => person.id === outsider.userId)
                ? [
                    {
                      value: outsider.userId,
                      label: outsider.name,
                      ...(outsider.inWorkspace ? {} : { description: OUTSIDER_JOINS_AS_GUEST }),
                    },
                  ]
                : []),
              ...(lookupPerson === undefined ? [] : [{ value: OUTSIDER_OPTION, label: ASSIGN_OUTSIDER_OPTION }]),
```

- Change its `onChange={setAssigneeId}` to:

```tsx
            onChange={(next) => {
              if (next === OUTSIDER_OPTION) {
                setFindingOutsider(true);
                return;
              }
              setFindingOutsider(false);
              setAssigneeId(next);
            }}
```

- AFTER the Assignee field's closing `</label>` (`:1283`), NOT inside it, render the finder. The field's `<label className="gn-new-ticket__field">` wraps the `Select`. A finder inside it would nest a `<label>` in a `<label>` (invalid), add the finder's text to the hidden select's label, and send a click on the found line back to the Assignee picker. So it is a sibling of the label:

```tsx
          {assigneeCandidatesUnavailable === undefined && findingOutsider && lookupPerson !== undefined ? (
            <OutsiderFinder
              lookup={lookupPerson}
              onCancel={() => setFindingOutsider(false)}
              onPick={(person) => {
                setOutsider(person);
                setAssigneeId(person.userId);
                setFindingOutsider(false);
              }}
            />
          ) : null}
```

- Next to `const UNASSIGNED = '__unassigned__';` (`:23`), add `const OUTSIDER_OPTION = '__outsider__';`. Import `OutsiderFinder`, `ASSIGN_OUTSIDER_OPTION`, `OUTSIDER_JOINS_AS_GUEST` and the two `people/types` types.

`packages/app-core/src/views/create-ticket-flow.tsx`:
- Add to `CreateTicketFlowProps`:

```ts
  /** See `NewTicketDialogProps.lookupPerson` — passed through. */
  lookupPerson?: LookupPerson;
  /**
   * The outsider door (access plan W6). Present with `lookupPerson`: an outsider
   * draft's `ticket.created` is sent through it instead of `dataSource.ingest`.
   */
  assignOutsider?: AssignOutsider;
```

- Destructure both, pass `lookupPerson` to `<NewTicketDialog … />` as `{...(lookupPerson === undefined ? {} : { lookupPerson })}`, and replace `const outcome = await submitChildEvent(dataSource, childEvent);` (`:376`) with:

```tsx
    // An outsider birth assignee (access plan W6) goes through the outsider door;
    // every outcome branch below is unchanged because the answer still arrives as
    // an ingest result. The reopen path stays on `dataSource` — residual D11.
    const via =
      draft.assigneeIsOutsider === true && assignOutsider !== undefined && draft.assigneeId !== null
        ? { ...dataSource, ingest: outsiderIngest(assignOutsider, draft.assigneeId) }
        : dataSource;
    const outcome = await submitChildEvent(via, childEvent);
```

`packages/app-core/src/views/ticket-sheet.tsx`:
- Add `lookupPerson?: LookupPerson; assignOutsider?: AssignOutsider;` to `TicketSheetProps`, each with a one-line docblock pointing at the dialog's, and destructure them.
- Change `submitAssignee` (`:1258`) to take a second parameter and route through the door:

```tsx
  const submitAssignee = async (assigneeId: string | null, viaOutsider = false): Promise<void> => {
    const event = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.assigned',
      payload: { assigneeId },
    });
    // The outsider door (access plan W6) for someone found by email who is not
    // in the workspace; the ordinary door for everyone else. Same answer shape,
    // same refusal rendering below (case 3.990).
    const results =
      viaOutsider && assignOutsider !== undefined && assigneeId !== null
        ? await outsiderIngest(assignOutsider, assigneeId)([event])
        : await dataSource.ingest([event]);
```

  The rest of the body is unchanged.
- In `assigneeRow` (`:2669`):
  - add `const OUTSIDER_OPTION = '__outsider__';` beside `UNASSIGNED`, and `const [findingOutsider, setFindingOutsider] = useState(false);` at the component's top level with the other state (NOT inside the IIFE);
  - in the final `return`'s `options`, append `...(lookupPerson === undefined ? [] : [{ value: OUTSIDER_OPTION, label: ASSIGN_OUTSIDER_OPTION }])`;
  - its `onChange` becomes:

    ```tsx
              onChange={(next) => {
                if (next === OUTSIDER_OPTION) {
                  setFindingOutsider(true);
                  return;
                }
                void submitAssignee(next === UNASSIGNED ? null : next);
              }}
    ```

  - the `control` becomes a fragment of that `Select` plus:

    ```tsx
            {findingOutsider && lookupPerson !== undefined ? (
              <OutsiderFinder
                lookup={lookupPerson}
                onCancel={() => setFindingOutsider(false)}
                onPick={(person) => {
                  setFindingOutsider(false);
                  void submitAssignee(person.userId, !person.inWorkspace);
                }}
              />
            ) : null}
    ```

- Import `OutsiderFinder`, `ASSIGN_OUTSIDER_OPTION`, `outsiderIngest` and the types.

`packages/app-core/src/online/invites-admin.ts`:
- `MintedInvite` becomes `{ inviteId: string; url: string; expiresAt: string; emailSent: boolean }`. Add a docblock line: "`emailSent` — whether the server mailed an EMAIL-channel invitation (access plan W5); always `false` for phone."
- In `mintInvite`, read `const emailSent = record['emailSent'];` and extend the all-or-none guard to `|| typeof emailSent !== 'boolean'`. Return `{ inviteId, url, expiresAt, emailSent }`.

- [ ] **Step 5: Run and watch it pass.** Same command. Then run the whole `app-core` suite: `cd packages/app-core && pnpm exec vitest run --no-file-parallelism > /tmp/access-app-core.log 2>&1; tail -30 /tmp/access-app-core.log`. Cases 13.968 and 13.1367–13.1370 must stay green unchanged. Then run `pnpm --filter @gisik-nokma/app-core typecheck`.

- [ ] **Step 6: Flip 3.982–3.990. Features.md:** under `The New ticket dialog` (`:115`) append:

    ```markdown
      - ✅ **Assign someone outside the workspace, found by exact email** (owner rulings 2026-09-29; access plan Task 7; `packages/app-core/src/views/outsider-finder.tsx`, `people/`, `online/people.ts`) — the New ticket dialog's and the ticket sheet's Assignee pickers gain **Assign someone outside this workspace…**: type their email, **Find** shows the one account with exactly that email (or "No user with that email."), **Assign** picks them. An outsider's claim goes through `POST …/assign-outsider` (joined as a guest, sees only that ticket); someone already in the workspace is assigned the ordinary way. Hosts opt in by passing `lookupPerson`/`assignOutsider`; absent, the pickers are unchanged. Cases 3.982–3.990.
    ```

- [ ] **Step 7: Commit** as `Access 7: app-core people gateway and the outsider arm (3.982-3.990)`, then work through the mutations.

---

### Task 8: `apps/web` — the invite form, its result card, the lookup line, and the hosts' wiring

> Invoke `ui-ux-pro-max` beside the workflow skill for this task.

**Files:**
- Create: `apps/web/src/invite-copy.ts`, `apps/web/src/people-props.ts`, `apps/web/test/people-props.test.ts`, `apps/web/test/access-css.test.ts`.
- Modify: `apps/web/src/providers.tsx`:
  - `AppServices` (`:65-78`);
  - the constructed services (`:142-165`).
- Modify: `apps/web/test/helpers/stub-services.ts`:
  - `GatewayStubs` (`:73-105`);
  - `stubServices`' returned gateways, below the query block.
- Modify: `apps/web/app/w/[workspaceId]/members/page.tsx`:
  - `MembersPage`'s `minted` state and the result card (`:579-595`);
  - the `onMinted` call (`:610-…`);
  - `MintForm` (`:759-970`): remove the project read, state and select; add the lookup; change the button label.
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` (`<CreateTicketFlow` `:2224`, `<TicketSheet` `:3593`), `apps/web/app/w/[workspaceId]/my-work/page.tsx` (`<TicketSheet` `:366`) and `apps/web/src/notes/note-document.tsx` (`<TicketSheet` `:721`).
- Modify: `apps/web/app/globals.css` (EOF block).
- Test: `apps/web/test/members-page.test.tsx` (existing).
- Modify: `test-cases/03-foundation-ledger.md`, `test-cases/13-second-wave-roles-and-navigation.md` (13.886, 13.1181), `Features.md`.

**Interfaces:**
- Produces:
  - `AppServices.people: PeopleGateway`;
  - `GatewayStubs.people?: Partial<PeopleGateway>`, whose un-stubbed members reject BY NAME, the helper's standing rule;
  - `peopleProps(people: PeopleGateway, workspaceId: string): { lookupPerson: LookupPerson; assignOutsider: AssignOutsider }`.
  - `invite-copy.ts`:
    - `SEND_INVITATION`, `CREATE_INVITE_LINK`, `INVITE_EMAIL_FAILED`;
    - `inviteEmailedLine(address)`, `hasAccountLine(name)`, `alreadyMemberLine(name)`.
- Consumes: Task 7's gateway, types and `MintedInvite.emailSent`.

**What leaves the form (D2).**
- The `Project access` select, its `projectScope` state, the `useWorkspaceProjects` read that fed it, and the `projectIds` spread go.
- The mint body is `{ address, channel, role }` for every role.
- The `MintForm` docblock paragraphs about the project field (`:741-757`, and the `projectScope` docblock `:787-803`) are replaced by one sentence: "The project field was removed 2026-09-29 (owner ruling A: admins and members are on every project); the door still accepts `projectIds`, and this form never sends it."

Cases, under the same `## People…` heading in `03-foundation-ledger.md`. +9:

```markdown
- ❌ **3.991 — the invite form has no Project access control for any role, and the body is exactly `{address, channel, role}` for a member, an admin and a guest;** control: Channel and Role are still there. Mutation: send `projectIds: []` for a member.
- ❌ **3.992 — an EMAIL invitation the server mailed shows `Invitation emailed to <address>.` as a status above the one-time link;** control: the link and its expiry line still render. Mutation: render the line when `emailSent` is false.
- ❌ **3.993 — an EMAIL invitation the server could NOT mail shows `The email could not be sent — copy the link below and send it yourself.` as an alert, and the link;** control: no emailed line. Mutation: drop the failed branch.
- ❌ **3.994 — with Channel on Phone (SMS) the button reads `Create invite link`, and the result card says nothing about email;** control: on email the button reads `Send invitation`. Mutation: key the label on role instead of channel.
- ❌ **3.995 — leaving the Address field with an email that matches an account shows `<name> already has an account.`, and sending uses that account's email;** control: the lookup was called with the typed address. Mutation: send the typed address.
- ❌ **3.996 — a match who is already in the workspace shows `<name> is already in this workspace.`;** control: the send button stays enabled (re-inviting is the person's call). Mutation: render the has-account line for a member.
- ❌ **3.997 — no match shows nothing, and a phone-channel address is never looked up;** control: an email-channel address is. Mutation: look up on every blur.
- ❌ **3.998 — `peopleProps` binds both functions to the workspace: `lookupPerson(e)` calls `people.lookup(ws, e)` and `assignOutsider(u, e)` calls `people.assignOutsider(ws, u, e)`;** control: a second workspace binds its own id. Mutation: bind a constant workspace id.
- ❌ **3.999 — every class the outsider finder and the result card render has a rule inside the access-and-invites block of `globals.css`, and every control in the finder is at least `2.75rem` tall;** control: the block's markers are present exactly once. Mutation: delete the `.gn-outsider-finder__actions` rule.
```

Amend these, keeping their ids:
- **`3.129–3.136`'s line** (`03-foundation-ledger.md:115`): "Amended 2026-09-29 (A): the project field is gone; 3.991 pins the body."
- **13.886** (`13-second-wave-roles-and-navigation.md:1352`): its "two native fields" become one, the address field. Its test (`members-page.test.tsx:1387-…`) keeps the address half and drops the projects half, and the case line says so.
- **13.1181** (`:1368`) becomes `🚫`: "Retired 2026-09-29, owner ruling (A): the project select no longer exists; 3.991 pins its absence." Delete its three tests (`members-page.test.tsx:351-420`) in the same commit.
- **The two `3.133` tests** (`:252-331`) keep their ids:
  - the guest one keeps its body minus the `Project access` clicks, asserting the same key set;
  - the member one becomes `'3.133 AMENDED (A): a MEMBER invitation sends no projectIds — the field is gone'` and asserts `Object.keys(body).sort()` equals `['address', 'channel', 'role']`.
- **Every `mintInvite` stub** in `members-page.test.tsx` returns `emailSent: true` (`grep -n "mintInvite:" apps/web/test/members-page.test.tsx` lists them), so the type and the result card are satisfied.

- [ ] **Step 1: Write the cases and the amendments to the case lines.** Guard: +9 (13.1181 stays an id line).

- [ ] **Step 2: Write the failing tests.** In `apps/web/test/members-page.test.tsx`:
  - give `mount` a fifth parameter `people: Partial<PeopleGateway> = {}`, passed to `stubServices` as `{ invitesAdmin, people }`;
  - append:

```tsx
describe('access plan — the invite form after 2026-09-29 (3.991–3.997)', () => {
  const MINT_OK = (emailSent: boolean) => ({
    inviteId: 'i_1',
    url: 'http://localhost:3001/invite/tok',
    expiresAt: '2026-10-13T10:00:00.000Z',
    emailSent,
  });

  it('3.991 no Project access for any role; the body is exactly address/channel/role; CONTROL: Channel and Role remain', async () => {
    const bodies: unknown[] = [];
    mount({
      listPending: async () => [],
      mintInvite: async (_ws, request) => {
        bodies.push(request);
        return MINT_OK(true);
      },
    });
    const user = userEvent.setup();
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form')!;
    expect(within(form).queryByRole('button', { name: /Project access/ })).toBeNull();
    expect(within(form).getByRole('button', { name: /Channel/ })).toBeInTheDocument();
    for (const role of ['member', 'admin', 'guest']) {
      await user.click(within(form).getByRole('button', { name: /Role/ }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: role }));
      await user.clear(screen.getByLabelText('Address'));
      await user.type(screen.getByLabelText('Address'), `${role}@example.test`);
      await user.click(screen.getByRole('button', { name: SEND_INVITATION }));
      // Wait for THIS role's body, not any body: a `> 0` wait is already true on
      // the second pass and would read the previous role's request.
      const expected = ['member', 'admin', 'guest'].indexOf(role) + 1;
      await waitFor(() => expect(bodies).toHaveLength(expected));
      expect(Object.keys(bodies[expected - 1] as object).sort()).toEqual(['address', 'channel', 'role']);
    }
  });

  it('3.992 a mailed invitation says so above the link; CONTROL: the link and expiry remain', async () => {
    mount({ listPending: async () => [], mintInvite: async () => MINT_OK(true) });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'anselma@example.test');
    await user.click(screen.getByRole('button', { name: SEND_INVITATION }));
    expect(await screen.findByText(inviteEmailedLine('anselma@example.test'))).toHaveAttribute('role', 'status');
    expect(screen.getByText('http://localhost:3001/invite/tok')).toBeInTheDocument();
    expect(screen.getByText(/It stops working after/)).toBeInTheDocument();
  });

  it('3.993 a failed mail is an alert, with the link; CONTROL: no emailed line', async () => {
    mount({ listPending: async () => [], mintInvite: async () => MINT_OK(false) });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'anselma@example.test');
    await user.click(screen.getByRole('button', { name: SEND_INVITATION }));
    expect(await screen.findByRole('alert')).toHaveTextContent(INVITE_EMAIL_FAILED);
    expect(screen.queryByText(inviteEmailedLine('anselma@example.test'))).toBeNull();
    expect(screen.getByText('http://localhost:3001/invite/tok')).toBeInTheDocument();
  });

  it('3.994 Phone (SMS) reads Create invite link and says nothing about email; CONTROL: email reads Send invitation', async () => {
    mount({ listPending: async () => [], mintInvite: async () => MINT_OK(false) });
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: SEND_INVITATION })).toBeInTheDocument();
    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form')!;
    await user.click(within(form).getByRole('button', { name: /Channel/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Phone (SMS)' }));
    await user.type(screen.getByLabelText('Address'), '+919001400001');
    await user.click(screen.getByRole('button', { name: CREATE_INVITE_LINK }));
    expect(await screen.findByText('http://localhost:3001/invite/tok')).toBeInTheDocument();
    expect(screen.queryByText(INVITE_EMAIL_FAILED)).toBeNull();
    expect(screen.queryByText(/emailed/)).toBeNull();
  });

  it('3.995 a matching account is named on blur, and the invite goes to its email; CONTROL: looked up with the typed address', async () => {
    const bodies: Array<{ address: string }> = [];
    const lookups: string[] = [];
    mount(
      {
        listPending: async () => [],
        mintInvite: async (_ws, request) => {
          bodies.push(request);
          return MINT_OK(true);
        },
      },
      undefined,
      undefined,
      {},
      {
        lookup: async (_ws, email) => {
          lookups.push(email);
          return { userId: 'u_a', name: 'Anselma Marak', email: 'anselma@example.test', inWorkspace: false, role: null };
        },
      },
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'Anselma@Example.test');
    await user.tab();
    expect(await screen.findByText(hasAccountLine('Anselma Marak'))).toBeInTheDocument();
    expect(lookups).toEqual(['Anselma@Example.test']);
    await user.click(screen.getByRole('button', { name: SEND_INVITATION }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.address).toBe('anselma@example.test');
  });

  it('3.996 an existing member is named as one; CONTROL: Send stays enabled', async () => {
    mount({ listPending: async () => [], mintInvite: async () => MINT_OK(true) }, undefined, undefined, {}, {
      lookup: async () => ({ userId: 'u_b', name: 'Balti Sangma', email: 'balti@example.test', inWorkspace: true, role: 'member' }),
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'balti@example.test');
    await user.tab();
    expect(await screen.findByText(alreadyMemberLine('Balti Sangma'))).toBeInTheDocument();
    expect(screen.queryByText(hasAccountLine('Balti Sangma'))).toBeNull();
    expect(screen.getByRole('button', { name: SEND_INVITATION })).toBeEnabled();
  });

  it('3.997 no match shows nothing; a phone address is never looked up; CONTROL: an email one is', async () => {
    const lookups: string[] = [];
    mount({ listPending: async () => [], mintInvite: async () => MINT_OK(false) }, undefined, undefined, {}, {
      lookup: async (_ws, email) => {
        lookups.push(email);
        return null;
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Address'), 'nobody@example.test');
    await user.tab();
    await waitFor(() => expect(lookups).toEqual(['nobody@example.test']));
    expect(screen.queryByText(/already/)).toBeNull();

    const form = (await screen.findByRole('heading', { name: 'Invite somebody' })).closest('form')!;
    await user.click(within(form).getByRole('button', { name: /Channel/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Phone (SMS)' }));
    await user.clear(screen.getByLabelText('Address'));
    await user.type(screen.getByLabelText('Address'), '+919001400001');
    await user.tab();
    expect(lookups).toEqual(['nobody@example.test']);
  });
});
```

  Import `SEND_INVITATION, CREATE_INVITE_LINK, INVITE_EMAIL_FAILED, inviteEmailedLine, hasAccountLine, alreadyMemberLine` from `'../src/invite-copy.js'`, and `type PeopleGateway` from `'@gisik-nokma/app-core/online'`.

  Pin the copy literally once, in a first `it` of this describe:

```tsx
  it('pins the invite copy literally, once', () => {
    expect(SEND_INVITATION).toBe('Send invitation');
    expect(CREATE_INVITE_LINK).toBe('Create invite link');
    expect(inviteEmailedLine('a@b.test')).toBe('Invitation emailed to a@b.test.');
    expect(INVITE_EMAIL_FAILED).toBe('The email could not be sent — copy the link below and send it yourself.');
    expect(hasAccountLine('Anselma')).toBe('Anselma already has an account.');
    expect(alreadyMemberLine('Anselma')).toBe('Anselma is already in this workspace.');
  });
```

`apps/web/test/people-props.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { peopleProps } from '../src/people-props.js';

describe('3.998 peopleProps binds the workspace', () => {
  it('3.998 both functions carry the workspace id; CONTROL: a second workspace binds its own', async () => {
    const lookup = vi.fn(async () => null);
    const assignOutsider = vi.fn(async () => ({ status: 'committed', eventId: 'e', seq: 1, serverTime: 't' }) as const);
    const people = { lookup, assignOutsider };
    const event = { id: 'e' } as unknown as SubmittedEvent;
    await peopleProps(people, 'ws_1').lookupPerson('a@b.test');
    await peopleProps(people, 'ws_1').assignOutsider('u_1', event);
    await peopleProps(people, 'ws_2').lookupPerson('c@d.test');
    expect(lookup.mock.calls).toEqual([['ws_1', 'a@b.test'], ['ws_2', 'c@d.test']]);
    expect(assignOutsider.mock.calls).toEqual([['ws_1', 'u_1', event]]);
  });
});
```

`apps/web/test/access-css.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Access plan Task 8, case 3.999 — the rules exist, inside the plan's own block. */

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'), 'utf8');
const BEGIN = '/* ══ access-and-invites: begin ══';
const END = '/* ══ access-and-invites: end ══ */';

describe('3.999 the access-and-invites CSS block', () => {
  it('3.999 every rendered class has a rule in the block, controls are 44px; CONTROL: markers appear once', () => {
    expect(CSS.split(BEGIN)).toHaveLength(2);
    expect(CSS.split(END)).toHaveLength(2);
    const block = CSS.slice(CSS.indexOf(BEGIN), CSS.indexOf(END));
    for (const cls of ['.gn-outsider-finder', '.gn-outsider-finder__actions', '.gn-outsider-finder__found', '.gn-invite-mint__emailed', '.gn-invite-mint__account']) {
      expect(block, cls).toMatch(new RegExp(`${cls.replace(/[.]/g, '\\.')}\\s*[,{]`));
    }
    expect(block).toMatch(/\.gn-outsider-finder[^{]*\{[^}]*min-height:\s*2\.75rem/);
  });
});
```

- [ ] **Step 3: Run and watch it fail.** `pnpm turbo run build`, then `cd apps/web && pnpm exec vitest run --no-file-parallelism test/members-page.test.tsx test/people-props.test.ts test/access-css.test.ts > /tmp/access-web.log 2>&1; tail -30 /tmp/access-web.log`. Expected: the new files fail to import, and the new describe fails.

- [ ] **Step 4: Implement.**

`apps/web/src/invite-copy.ts`:

```ts
/** The invite form's strings added by the access plan (Task 8). Pinned literally once in `members-page.test.tsx`. */
export const SEND_INVITATION = 'Send invitation';
export const CREATE_INVITE_LINK = 'Create invite link';
export const INVITE_EMAIL_FAILED = 'The email could not be sent — copy the link below and send it yourself.';
export const inviteEmailedLine = (address: string): string => `Invitation emailed to ${address}.`;
export const hasAccountLine = (name: string): string => `${name} already has an account.`;
export const alreadyMemberLine = (name: string): string => `${name} is already in this workspace.`;
```

`apps/web/src/people-props.ts`:

```ts
import type { AssignOutsider, LookupPerson } from '@gisik-nokma/app-core';
import type { PeopleGateway } from '@gisik-nokma/app-core/online';

/**
 * The two outsider props the flow and the sheets take, bound to one workspace
 * (access plan Task 8). One place, so the four hosts cannot bind them
 * differently.
 */
export function peopleProps(
  people: Pick<PeopleGateway, 'lookup' | 'assignOutsider'>,
  workspaceId: string,
): { lookupPerson: LookupPerson; assignOutsider: AssignOutsider } {
  return {
    lookupPerson: (email) => people.lookup(workspaceId, email),
    assignOutsider: (userId, event) => people.assignOutsider(workspaceId, userId, event),
  };
}
```

`apps/web/src/providers.tsx`:
- Import `createHttpPeopleGateway` and `type PeopleGateway` from `'@gisik-nokma/app-core/online'`.
- Add to `AppServices`: `/** Access plan: the exact-email lookup and the outsider door. */ people: PeopleGateway;`
- In the constructed object, after `ticketLocation`: `people: createHttpPeopleGateway(http),`.

`apps/web/test/helpers/stub-services.ts`:
- Add `people?: Partial<PeopleGateway>;` to `GatewayStubs`, with a one-line docblock: the same reject-by-name rule.
- In the returned services, add:

```ts
    people: {
      lookup: unstubbed('people.lookup'),
      assignOutsider: unstubbed('people.assignOutsider'),
      ...gateways.people,
    } as PeopleGateway,
```

  Match the helper's own spelling of the other gateways' construction; read how `invitesAdmin` is assembled there.

`apps/web/app/w/[workspaceId]/members/page.tsx`:
- Import from `'../../../../src/invite-copy.js'` (match the file's existing relative-import depth) the six copy exports, and `type MintedInvite` if it is not already imported.
- **`MembersPage`.** Change the `minted` state's type to `(MintedInvite & { address: string; channel: string }) | null`. `MintForm`'s `onMinted` now receives `(result, sent: { address: string; channel: string })`, and the page stores `{ ...result, ...sent }`.
- **The result card** (`:581`). Insert as its FIRST children:

```tsx
          {minted.channel === 'email' ? (
            minted.emailSent ? (
              <p role="status" className="gn-invite-mint__emailed">
                {inviteEmailedLine(minted.address)}
              </p>
            ) : (
              <p role="alert" className="gn-refusal gn-refusal--transport">
                {INVITE_EMAIL_FAILED}
              </p>
            )
          ) : null}
```

- **`MintForm`:**
  - delete `const projects = useWorkspaceProjects(workspaceId);` (`:782`), the `projectScope` state, the `projectIds` spread, and the whole `{role === 'guest' ? null : (<> … Project access … </>)}` block;
  - remove the `useWorkspaceProjects` import (`:18`); `:782` is its only call in the file;
  - add `const { invitesAdmin, people } = useAppServices();` (in place of the existing destructure) and:

```tsx
  /**
   * The account the typed address belongs to, if any (access plan W8, owner
   * ruling 2026-09-29 "fold it in"). Looked up on BLUR, email channel only, and
   * never listed — exact match or nothing. Sending uses the account's email, so
   * the invitation reaches the address the account signs in with.
   */
  const [account, setAccount] = useState<LookedUpPerson | null>(null);
  const lookUp = (): void => {
    if (channel !== 'email' || !address.includes('@')) return;
    void people.lookup(workspaceId, address).then(setAccount, () => setAccount(null));
  };
```

  - On the address `<input>`: `onBlur={lookUp}`. Its `onChange` also calls `setAccount(null)`.
  - In `submit`, the body becomes `{ address: account?.email ?? address, channel, role }`, and the success arm becomes `onMinted(result, { address: account?.email ?? address, channel })`.
  - Below the address field:

```tsx
      {account !== null ? (
        <p role="status" className="gn-invite-mint__account">
          {account.inWorkspace ? alreadyMemberLine(account.name) : hasAccountLine(account.name)}
        </p>
      ) : null}
```

  - The submit button's label becomes `{channel === 'phone' ? CREATE_INVITE_LINK : SEND_INVITATION}`.
  - Import `type LookedUpPerson` from `'@gisik-nokma/app-core'`.

**Hosts.** Add `const { people } = useAppServices();` (or extend the existing destructure). Then spread `{...peopleProps(people, workspaceId)}` onto:
- `<CreateTicketFlow` (`p/[projectId]/page.tsx:2224`);
- `<TicketSheet` (`p/[projectId]/page.tsx:3593`, `my-work/page.tsx:366`, `src/notes/note-document.tsx:721`).

Each host already has `workspaceId` in scope; read it and confirm before spreading. Import `peopleProps` from `src/people-props.ts` at each host's relative depth.

`apps/web/app/globals.css`, appended at EOF:

```css
/* ══ access-and-invites: begin ══
   Access plan Tasks 7–8 (2026-09-29). The outsider finder inside the New ticket
   dialog and the ticket sheet, and the invite form's two status lines. Tokens
   only (no raw colours); every control 44px tall. */
.gn-outsider-finder {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.gn-outsider-finder .gn-field__input,
.gn-outsider-finder .gn-button {
  min-height: 2.75rem;
}
.gn-outsider-finder__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.gn-outsider-finder__found {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
}
.gn-invite-mint__emailed,
.gn-invite-mint__account {
  margin: 0;
  color: var(--gn-text-muted);
}
/* ══ access-and-invites: end ══ */
```

  `--gn-text-muted` is the product's muted-text token (174 uses in `packages/ui/src/ui.css`). `token-discipline.test.ts` refuses a raw colour.

  3.999's regex needs `min-height: 2.75rem` inside a rule whose selector starts `.gn-outsider-finder`. The second rule above satisfies it.

- [ ] **Step 5: Run and watch it pass.** Run the whole `apps/web` suite: `cd apps/web && pnpm exec vitest run --no-file-parallelism > /tmp/access-web.log 2>&1; tail -40 /tmp/access-web.log`. Then run `pnpm --filter @gisik-nokma/web typecheck`.

  Every page test that mounts a host now needs `people` stubbed ONLY if it opens the outsider arm. The spread alone calls nothing, so no existing case should need a stub. A case that reds with "did not stub people.lookup" found a host that calls on render, which is a bug. Fix the host, not the case.

- [ ] **Step 6: Flip 3.991–3.999. Features.md:**
  - under `Invite links` (`:197`) append:

    ```markdown
      - ✅ **The invite form after owner ruling A, and the email it sends** (2026-09-29; access plan Task 8; `apps/web/app/w/[workspaceId]/members/page.tsx`, `apps/web/src/invite-copy.ts`) — no Project access field (admins and members are on every project); the result card says "Invitation emailed to <address>." or, as an alert, that the email could not be sent and the link must be sent by hand; on Phone (SMS) the button reads **Create invite link**. Leaving the Address field with an email that belongs to an account names them ("… already has an account." / "… is already in this workspace.") and the invitation goes to that account's email; nothing is listed. Cases 3.991–3.997, 3.999.
    ```

  - under `The people page` (`:424`) append:

    ```markdown
      - ⚙️ **`AppServices.people` and `peopleProps`** (access plan Task 8) — the lookup and outsider door, bound per workspace and passed to the New ticket flow and every ticket sheet host. Case 3.998.
    ```

- [ ] **Step 7: Commit** as `Access 8: web — invite form, result card, lookup, hosts (3.991-3.999)`, then work through the mutations.

---

### Task 9: The help corpus — manual and FAQ say what the product now does

**Files:**
- Modify: `docs/manual.md` (§4 `:234-349`; the roles table `:283-295`).
- Modify: `docs/faq.md` (People and roles `:114-144`; Privacy "What can a guest see?" `:858-862`).
- Regenerate: `packages/app-core/src/help/content.generated.ts`.
- Possibly: `scripts/help-quoted-strings-absent.json` (delete spans only).

**Interfaces:** none.

No case ids: `pnpm check:help` is the gate, as in the trash plans.

- [ ] **Step 1: Rewrite `docs/manual.md`.**
  - **§4 "Sending an invitation" (`:236-257`), step 3:** delete the **Projects** bullet, and change **Channel** to "**Channel** — **email** or **Phone (SMS)**."
  - **Step 4** becomes: "Press **Send invitation** (for Phone (SMS) the button reads **Create invite link**). For email, the product sends the invitation to that address, and the next screen says it was emailed. If the email could not be sent, the screen says so, and you send the link yourself."
  - **Add a step 3a:** "If the email address you typed belongs to somebody who already has an account, the form says so when you leave the box, and the invitation goes to the address that account signs in with."
  - **Keep** the "Copy that link" callout, re-worded to: "The link is still shown once. For an emailed invitation you do not need it, but copy it anyway if the email did not go."
  - **§4 "About the Channel dropdown" (`:259-265`)** becomes: "**email** sends the invitation for you. **Phone (SMS)** does not send anything yet: it makes the link, and you send it by message yourself."
  - **§4 "About the Project access box" (`:267-281`)** becomes one short paragraph under the SAME heading, so a reader who remembers the box finds it: "**Removed on 29 September 2026.** Admins and members now see every project in their workspace, so there is nothing to choose. A guest still sees only the jobs shared with them or assigned to them."
  - **The roles table (`:283-295`):**
    - the **Admin** row becomes: "Can invite people and set up stages and job types, and sees every project in the workspace.";
    - the **Member** row becomes: "Ordinary staff. Sees every project in the workspace and does the work. Cannot invite people, cannot change how the stages work.";
    - the **Guest** row becomes: "An outsider — a client, your accountant. Sees only the jobs somebody has shared with them or assigned to them, and nothing else. Cannot see the people list. Cannot create jobs.";
    - delete the paragraph "**The practical consequence of the admin rule:** …" (`:292-294`).
  - **§5 — add a subsection after "What you can change afterwards"**, headed `### Assigning somebody who is not in the workspace`:

    > In the **Assignee** picker, choose **Assign someone outside this workspace…**, type their email and press **Find**. If an account has exactly that email, it is shown. Press **Assign**, and they join the workspace as a guest who sees only that job. Nothing is listed or suggested: you have to know their email. If nobody has that email, the picker says **No user with that email.** Anyone who can assign a job can do this.

- [ ] **Step 2: Rewrite `docs/faq.md`.**
  - **"Does the invitation get sent for me?" (`:116-119`)** becomes: "**By email, yes.** Pick **email** and the product sends it, and the screen tells you whether it went. **Phone (SMS)** is not sent for you: copy the link and send it yourself."
  - **"What do I put in the Project access box…?" (`:126-134`):** keep the question and replace the answer with: "Nothing: the box was removed on 29 September 2026. Admins and members see every project in the workspace."
  - **"Is an admin the same as sees everything?" (`:136-140`)** becomes: "**Close to it.** Since 29 September 2026 an admin, like every member, sees every project in the workspace. What they still do not see is a job shared with only named people who are not them. Only the owner sees those."
  - **"What can a guest see?" (`:858-862`)** becomes: "Only the jobs somebody explicitly shared with them, and any job assigned to them. Not the project, not the rest of the workspace. They see the workspace's name and an empty project list — intended, not broken. They cannot open the people list and cannot create jobs."
  - Add, under People and roles: **"Can I assign a job to somebody who is not in the workspace?"** Its answer is the §5 paragraph above, shortened to three sentences.

- [ ] **Step 3: Regenerate and check.** Run `pnpm help:generate`, then `pnpm check:help > /tmp/access-help.log 2>&1; tail -20 /tmp/access-help.log`.
  - Every double-quoted span you left in must be a product constant. The rewrites above use **bold**, not quotes, for labels.
  - If the check names a baselined span as no longer absent, delete that span from `scripts/help-quoted-strings-absent.json`.
  - If it names an UNDECLARED span, fix the document.
  - Then run `cd packages/app-core && pnpm exec vitest run --no-file-parallelism test/help > /tmp/access-app-core.log 2>&1; tail -20 /tmp/access-app-core.log`, using the help tests' real path: `ls packages/app-core/test | grep -i help`.

- [ ] **Step 4: Commit** as `Access 9: manual and FAQ — rule A, the assignee, emailed invitations, outsiders`. The body carries the `check:help` summary line.

---

## Before the PR

- [ ] Run `node --version` (v22), `pnpm turbo run build`, then the three suites (`apps/server`, `packages/app-core`, `apps/web`) whole, one at a time, each to `/tmp/access-<pkg>.log` and read by `tail`. Then run `pnpm check:citations`, `pnpm check:help`, `pnpm check:env` and `node scripts/check-case-ids.mjs`. The guard count must equal the start count + 8 + 10 + 3 + 8 + 15 + 9 + 9 = **+62**.
- [ ] `git fetch origin && git merge origin/release/trash`. Resolve `globals.css` by keeping both sides, and `Features.md` §6/§11/§3 by keeping both sides' bullets. Re-run the guard: it moves by exactly the id lines the merge brought in.
- [ ] Open the PR with `bash scripts/ctl/ctl pr open task/access-and-invites --repo <worktree> --base release/trash --title "Workspace access, assignment visibility and invites" --body FILE`. The body names:
  - every deviation (D1–D11);
  - the Task 2 amendment list and the vacuous-green fixtures founded;
  - D7's unreachable refusal;
  - the residuals: the rollup, the restricted-parent chip, the reopen path, and rule A's extra `proj_projects` read on every owner/admin/member resolve. That read sits on hot loops (the stream drain, grant-backfill, the per-row `canSee` in `builder-reads.ts:984`) and is not folded into the roster query. Measure it if the stream slows.

## Self-review (planner, against the spec)

1. **Spec coverage.**
   - W1 → Task 1 (+ Task 2 amendments).
   - W2 → 6.184.
   - W3 → Task 3.
   - W4 → Task 4.
   - W5 → Tasks 5 and 8.
   - W6 → Tasks 6 and 7.
   - W7 → Tasks 6 and 7.
   - W8 → Tasks 6 and 8.
   - W9 → Task 8.
   - Spec §5 error handling → 6.200, 6.211, 6.212, 3.990, 3.993.
   - Docs → Task 9.
2. **Placeholders.** Where a line number or helper could not be read into this plan, the step names the file, the symbol and the check to make: the notes fixture's guard, `rowsFor`, `seedWorkflowDef`, the members-page mount, and each host's `workspaceId`. No step says "add tests" without the test.
3. **Type consistency.**
   - `LookedUpPerson` is the same five fields on the server (`routes/people.ts`) and the client (`people/types.ts`).
   - `assigneeIsOutsider?: true` is set in Task 7's dialog and read in its flow.
   - `MintedInvite.emailSent` is produced in Task 5 (the route) and Task 7 (the mapper), and read in Task 8.
   - `peopleProps` returns exactly the two props Task 7 added.
4. **Review Focus.** All nine lines have a named case in an owning task.
