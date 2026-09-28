# Workspace access, assignment visibility and invites — design

**Status:** spec for owner review. Written 2026-09-29 by the planner from a production user report and the owner's rulings of the same day.
**Base:** `origin/release/trash` at `cd6300ee`. Every citation below is a line read on that tree. A citation is a reading that expires, so the plan re-reads each one before it builds on it.
**Target branch:** `release/trash`. The owner's ruling is that this ships with the trash release.

## 1. The request

**The user report (2026-09-24, relayed by the owner):**
- invitations are not arriving by email;
- projects created by one member are not visible to teammates, "even when they have access to the whole workspace";
- an assigned ticket does not show in the assignee's feed or workspace;
- the assignee gets no notification;
- they want to "choose from existing people … instead of typing their email every time".

**The owner's rulings (2026-09-29), verbatim:**
1. "A, dont repair now, ship together with trash. make the invite actually send email. if an assignee is assigned, even if that person does not have visibility to the workspace or project, they can still get visibility to just that single ticket. Notify on the New ticket dialog's assignee. schedule the small feature." Here **A** means "admins and members see every project in their workspace by default".
2. "List them. this deployment is private, and it is only for their team."
3. "anyone who can assign" may pull an outsider in as a guest along with the assignment.
4. "fold it in": the "pick existing people" invite feature is built in this plan, not scheduled.
5. "Picking someone outside the workspace: have them type up their email, and only show if a user matching that email is found." This refines ruling 2. The pickers never list people outside the workspace.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| W1 | **Rule A.** A workspace `owner`, `admin` or `member` is on every project of the workspace for every purpose that asks "is this person on the project". A guest is unchanged: a guest is on no project and sees only what an explicit list names. | owner (A); including the owner is the planner's (D1) |
| W2 | **No data repair.** Nothing is migrated. Rule A is a read-time rule over `proj_projects`, so the fifteen non-owner members in production (13 admins, 2 members), who are all on zero projects today, see every project the moment this ships. That is the whole reason no repair is needed. | owner ("dont repair now") |
| W3 | **The assignee sees their own ticket.** The ticket's current assignee may see that one ticket, whatever its audience. This does not extend to its parent, its children, its project, or a note attached to it. Unassigning takes it away. | owner |
| W4 | **Notify on create.** A ticket born with an assignee (the New ticket dialog's picker) notifies the assignee exactly as `ticket.assigned` does. | owner |
| W5 | **Invitations are emailed.** For the email channel, the server sends the invitation link by email after the invitation commits. A failed send never fails the invitation: the link is still shown once, and the screen says the email did not go. | owner |
| W6 | **Assigning someone outside the workspace.** Anyone who may assign the ticket may assign a person who has an account but is not in the workspace. That person is added to the workspace as a **guest**, and the ticket is assigned to them, in one server act. Under W3 the guest sees that ticket, and nothing else in the workspace. | owner rulings 3 and 5 |
| W7 | **Finding an outsider is an exact email lookup.** You type an email, and the one account with exactly that email is shown (case-insensitive, trimmed), or "No user with that email." Nothing is listed or searched by prefix. | owner ruling 5 |
| W8 | **Invite someone who already has an account.** The invite form uses the same lookup. When the typed email matches an account, the form says so before you send, and the invitation goes to that account's email. The invitation and its acceptance are unchanged: the person still accepts. | owner ruling 4 |
| W9 | **The invite form loses its project picker.** Under W1, "Only <project>" means nothing for an admin or member. The form stops sending `projectIds`. The event schema still accepts the key, so old events replay. | planner (D2) |

## 3. What exists today (measured on `cd6300ee`)

**Invitations are never emailed.**
- The mint route `apps/server/src/routes/invites.ts:296-377` appends `invite.sent` (`:344`), stores the token hash, and answers `{inviteId, url, expiresAt}` (`:371-375`). It sends nothing.
- `SMTP_URL` (`apps/server/src/config.ts:217`, mapped `:301`) and `MAGIC_LINK_FROM` (`:225`, mapped `:302`) feed only the magic-link sender. The selection happens in `apps/server/src/auth/select-senders.ts:32-38`. The SMTP sender is `auth/smtp-magic-link-sender.ts:73-99`, with timeouts at `:32-36`. When `SMTP_URL` is unset, `LogMagicLinkSender` prints the link to stdout (`auth/magic-link-sender.ts:11-19`).
- Production has `SMTP_URL` as a SECRET (`deploy/do/app.yaml:140-141`) and `MAGIC_LINK_FROM: contact@artsourced.in` (`:181-182`). So the invitation email will come **from `contact@artsourced.in`**, unless an `INVITE_FROM` is added later.
- The web form's button reads **Send invitation** (`apps/web/app/w/[workspaceId]/members/page.tsx:957`). The result card shows only the link and its expiry (`:580-594`).
- The manual admits that nothing is sent (`docs/manual.md:259-265`). Its channel list says "email, sms and whatsapp" (`:245`), but the form offers `email` and `Phone (SMS)` (`members/page.tsx:42-45`), so that list is stale. The FAQ says the same things (`docs/faq.md:116-119`).

**The invite form scopes projects, and acceptance honours only a list.**
- The form's "Project access" select offers "All projects in this workspace" and one "Only <name>" per project (`members/page.tsx:940-947`). Choosing "All" omits `projectIds` (`:818`).
- Acceptance appends `project.member_added` only for the listed ids, and never for a guest (`apps/server/src/invites/acceptance.ts:186-198`).
- The event schema refuses `projectIds` on a guest invitation (`packages/domain/src/events/invites.ts:111-128`).
- **Production (read-only, 2026-09-29):** all 15 accepted invitations were "All projects", and all 15 non-owner members are on zero projects.

**What a person may see.**
- `resolveEffectiveRole` builds the workspace role and the project set from `proj_memberships` rows alone (`apps/server/src/permissions/effective-role.ts:100-148`).
- The ticket rule table is `apps/server/src/visibility/can-see.ts:29-34`, implemented at `:118-141`. The owner sees everything. An admin or member sees project mode only if they are on the project (`:134-136`), with no admin bypass. A guest sees only explicit lists that name them (`:127-128`).
- The same table is written again in SQL in `read/visible-where.ts:95-120`.
- `visibleProjects` returns every project only to the owner (`read/visible-projects.ts:203-204`). Its rationale for everyone else is at `:41-85`.
- Notes follow the same "membership, not role" rule (`visibility/can-read-note.ts:68-71`). The SQL twin is `read/visible-where.ts:287-289`.
- A new project gets `project.created` plus `project.member_added` for its founder only (`apps/web/app/w/[workspaceId]/page.tsx:99`, `:116`). A top-level ticket is born in project mode (`apps/server/src/projections/proj-visibility.ts:103`).
- Creating a ticket requires being on the project: `check-permission.ts:1367` refuses with `NOT_ON_PROJECT_REASON` (`:161-162`), and there is **no owner exemption** on that arm. The `note.created` home check has one (`:1313`).

**Assignment is accepted without visibility, then hidden.**
- Assigning names a person who must hold a workspace role (`namedPersonRefusal`, `check-permission.ts:1119-1128`, called at `:1431-1442`). A guest passes, whether or not they can see the ticket.
- My Work filters by the visibility predicate (`routes/my-work.ts:132`). Its design note is at `:53-62`.
- The fan-out drops the assignment notification when `canSee` is false (`notifications/fanout.ts:131`). It has no `ticket.created` branch (`:240-259`).
- The New ticket dialog puts the assignee on `ticket.created` (`packages/app-core/src/views/create-ticket-flow.tsx:327`).
- The only notification transport is the in-app inbox (`app.ts:1016-1022`; `notifications/transport.ts:46-53`).

**Deleted containers (trash Plan 1) are enforced separately from membership.**
- Deleted projects are dropped from `visibleProjects` (`read/visible-projects.ts:191`).
- `LIVE_TICKET_WHERE` drops tickets in a deleted project from every view (`read/visible-where.ts:211-212`).
- `checkLifecycle` refuses every write into a deleted workspace or project (`permissions/check-lifecycle.ts:122-171`).
- None of the three reads the project set, so rule A cannot reopen a deleted project.

**Batches are not atomic.** The ingest door commits each event on its own (`apps/server/src/ingest/ingest-service.ts:432-446`, one `commitOne` per event at `:445`). No check can see the other events in its batch. This is why W6 is a server route, not "two events in one batch" (D5).

## 4. Design

### 4.1 Rule A, centrally (W1, W2)

- `resolveEffectiveRole` adds every `proj_projects` row of the workspace to the project set, with `projectAdmin: false`, when the role is `owner`, `admin` or `member`. Explicit roster rows are applied **after** the implicit ones, so an explicit `projectAdmin: true` survives.
- A guest gets explicit rows only, as today.
- Every reader of the project set follows automatically:
  - `canSee` for project mode;
  - `visibleTicketsWhere`;
  - `visibleProjects`;
  - project-scoped notes (`canReadNote` and `visibleNotesWhere`);
  - the `ticket.created` and `note.created` doors;
  - `deleted-items.ts` (implicit rows carry `projectAdmin: false`, so nothing widens there);
  - the sync bootstrap's `me.projectIds`.
- **Deleted projects are NOT added by rule A** (the implicit rows read `proj_projects … AND deleted_at IS NULL`). Explicit roster rows are unchanged.
  - Every VIEW that hides deletion still hides it, for the three reasons in §3: the project list, every `LIVE_TICKET_WHERE` list, and writes.
  - The doors that ask `canSee` alone have no deletion predicate: ticket history (`routes/ticket-history.ts:281`), attachments, reconcile, the stream, and the sync bootstrap's `listVisibleTickets` (`visibility/visible-tickets.ts:69-80`). Only a deleted project's EXPLICIT members reach its tickets through those doors, exactly as before rule A. That is trash Plan 1's existing containment gap, neither widened nor closed here.
  - Rule A therefore adds no exposure to a deleted project. An admin or member who is not explicitly on it loses sight of its tickets at the moment it is deleted (case 6.217).
- The admin-no-bypass wording is removed wherever it argues the old rule:
  - `can-see.ts:50-55`;
  - `visible-where.ts:55`;
  - `visible-projects.ts:41-85`;
  - `effective-role.ts:158-160`;
  - `can-read-note.ts:68-70`;
  - `routes/my-work.ts:53-62`.
- The manual's role table (`docs/manual.md:283-295`) and its FAQ twin (`docs/faq.md:136-140`) are rewritten.
- `project.member_added` / `project.member_removed` still write roster rows. For admins and members those rows now matter only for the `projectAdmin` flag.
- The stream's roster purge on `project.member_removed` (case 6.17) can no longer make a ticket invisible to an admin or member. It still runs for a guest, where it names nothing today. That case is amended in place.

### 4.2 The invite form's project scope (W9)

The **Project access** select is removed from the form, and the form never sends `projectIds`. The route and the schema still accept the key: old events replay, and an API caller can still add explicit rows. Acceptance is unchanged.

### 4.3 The assignee sees their own ticket (W3)

- **`canSee`** becomes: the audience rule OR (the viewer holds a workspace role AND is the ticket's current `proj_tickets.assignee_id`). The assignee lookup runs only when the audience rule says no.
- **The SQL twin.** `visibleTicketsWhere` gains the same arm as `EXISTS (SELECT 1 FROM proj_tickets at WHERE at.ticket_id = v.ticket_id AND at.assignee_id = $viewer)`. It is a subquery over `v` because `listVisibleTickets` joins no `t` (`read/visible-where.ts:141-146`) (D6).
- **The audience-only predicate stays.** It is exported as `ticketAudienceWhere` and used by the note `inherit` arm. `canReadNote`'s `inherit` arm keeps calling `canSeeResolved`. So **a note attached to the ticket is not opened by the assignment**: the note keeps its own scope.
- **What follows from `canSee`:** the ticket sheet, history, comments, attachments, My Work, search, the list and the board (only that card), the stream (`visible-events-for.ts` calls `canSee`), and reconcile.
  - The assignee may also work the ticket — comment, attach, move its state — through the same door as any other viewer (`check-permission.ts:1398`).
  - The ticket's project is **not** added to the assignee's project list (`visibleProjects` reads the project set, not assignments).
  - The parent is shown as restricted.
- **Unassigning** (`ticket.assigned` with another person or `null`) removes the ticket from every read at once. A synced device drops it at its next reconcile (`sync/reconcile-route.ts:153`). The stream sends no per-event purge, by the ruling on case 6.101.
- **Grant notice.** `ticket.assigned` joins `GRANT_BACKFILL_TRIGGERS` (`visibility/grant-backfill.ts:151`), so a syncing device that could not see the ticket before pulls its history when it becomes theirs.
- **Residuals, recorded rather than built:** the rollup's `restrictedCount` (`visibility/rollup.ts:310`) and the restricted-parent chip (`read/restricted-parents.ts:97`) still ask the audience rule alone. A child visible only through assignment counts as restricted in its parent's rollup, and a parent visible only through assignment draws as a restricted chip.

### 4.4 Notify on create (W4)

The fan-out's `onCommitted` gains a `ticket.created` branch. It calls the same `handleAssigned` path: the payload's `assigneeId` must be present, not `null`, and not the actor. The dedupe key is `assignment:${env.id}`, and the payload matches `ticket.assigned`'s. The `canSee` gate stays, and under W3 it answers true for the new assignee.

### 4.5 Invitation email (W5)

- **The mailer.** New module `apps/server/src/invites/invite-mailer.ts`:
  - an `InviteMailer` interface;
  - `LogInviteMailer`, the dev and test implementation, which records the mail and logs a line without the link;
  - `SmtpInviteMailer`, which uses nodemailer with the magic-link sender's `SMTP_TIMEOUTS_MS`;
  - `selectInviteMailer(config)`, which gives SMTP when `SMTP_URL` is set and the log mailer otherwise;
  - `composeInviteEmail`, a pure function.
- **The From address** is `INVITE_FROM`, an optional email that defaults to `MAGIC_LINK_FROM`. It is documented in `.env.example`, and `check:env` enforces that. No app-spec change is needed, so production sends from `contact@artsourced.in`.
- **The content**, plain text:
  - subject: **`<inviter> invited you to <workspace> on Gisik Nokma`**;
  - body: who invited them, the workspace, the role, the link on a line of its own, and "The link stops working after <IST day and time>." The time comes from `formatIstInstant` (`packages/domain/src/clock-skew.ts:51`).
  - The inviter is their account name, else their email, else "Someone". The workspace name is `workspaceNameFromLedger`.
- **When.** Only for `channel === 'email'`, and only after the token row is stored. A failed send is logged and alerted through `alertWithoutWaiting` (`alerts/error-alerter.ts:123`). The route still answers 201.
- **The response** gains `emailSent: boolean`. It is `false` for the phone channel and for a failed send.
- **The screen.**
  - After an email invite, the result card reads **Invitation emailed to <address>.**, or **The email could not be sent — copy the link below and send it yourself.**, above the one-time link.
  - For the phone channel the button reads **Create invite link**, and the card says nothing about email.
  - Every string is an exported constant.

### 4.6 Finding an account by email (W7, W8)

- **`POST /v1/workspaces/:workspaceId/people-lookup`** takes `{ email }`.
  - The caller must be a signed-in member of the workspace (any role). Anyone else gets the read 404.
  - It answers `{ user: { userId, name, email, inWorkspace, role } | null }`.
  - The match is `lower(trim(email))` equal to `lower("user".email)`, over a VERIFIED real address only (the `routes/my-invitations.ts` rule). Two case-variant accounts answer `null`, because "the one exact match" does not exist. A synthetic phone address (`auth/synthetic-address.ts:65`) never matches.
  - It returns at most one row. There is no prefix match and no list.
  - It is a POST so the address never appears in a URL or a request log. It is added to `HTTP_ORIGIN_PROTECTED_ROUTES` and charged to the invite rate-limit bucket, because it answers "does this address have an account".
- **The invite form** looks up the address when it loses focus (email channel, value containing `@`), and shows:
  - **<name> already has an account.** Sending uses the account's email.
  - **<name> is already in this workspace.** Informational only. Re-inviting changes nothing, as the manual already warns.
  - nothing, when there is no match.
- **The assignee pickers** (New ticket dialog, ticket sheet) gain an option **Assign someone outside this workspace…**. Choosing it shows an email field and **Find**, then either the one account found or **No user with that email.** Picking a found person who is already in the workspace is an ordinary assignment.

### 4.7 Pulling an outsider in (W6)

- **`POST /v1/workspaces/:workspaceId/assign-outsider`** takes `{ userId, event }`. `event` is the caller's own `ticket.created` or `ticket.assigned` (as submitted to `/v1/events`) naming `userId` as assignee.
- **The steps:**
  1. The caller must hold a role in the workspace; otherwise 404.
  2. The event must name this workspace, the caller as actor, and `userId` as assignee; otherwise 400.
  3. `userId` must be an account; otherwise 422 with **That person has no account.**
  4. If `userId` already holds a role here, the event goes straight to the gated door (no grant).
  5. Otherwise the pre-flight runs the real permission gate on the caller's event, dry. The outsider is not a member yet, so a claim that would otherwise pass is refused by the named-person check, which is the last one on both arms. Any OTHER refusal is answered as it stands, and nothing is granted. No gate rule is restated.
  6. The server appends `membership.granted { userId, role: 'guest' }` through the internal door. The actor is the caller and the origin is `server`, which is the acceptance precedent (`invites/acceptance.ts:129-149`).
  7. The event goes through the gated client door as the caller.
  8. If the event is refused, the server appends `membership.revoked { userId }` through the internal door and answers the refusal. Nothing is left half-done that the caller cannot see.
- **The answer** is the event's `IngestResult`: 200 when committed, 422 otherwise.
- **The permission rule, stated.** "Anyone who can assign" is exactly the door's own rule for the event, so a guest who can see a ticket may pull someone in too (owner ruling 3). A stand-alone `membership.granted` from a non-admin is still refused (`check-permission.ts:716`). This route is the only way a non-admin's act grants a role, and only a guest role, only with an assignment.
- **What the pulled-in guest gets:**
  - the workspace in their workspace list (they hold a role);
  - the assignment notification (W4, or `ticket.assigned`'s own);
  - that ticket through W3;
  - nothing else. They are on no project and on no explicit list.

## 5. Error handling

- An SMTP failure is logged and alerted, and the route still answers 201 with `emailSent: false`. It is never a 500.
- A lookup with an empty or blank email is a 400 from the body schema. A non-member gets the shared 404 body (`read/membership.ts:15`).
- In the outsider route, a refusal after the grant is compensated (`membership.revoked`) before the refusal is returned. If the revoke itself throws, the route throws, so it is a 500 and it is alerted: a guest with no assignment has been left behind, and an operator must see it.
- On the client, every refusal is shown verbatim where the control is: the dialog's existing failure line, and the sheet's `serverRefusal`.

## 6. Testing (the plan pins case ids)

- **Rule A.**
  - An admin and a member each see a project-mode ticket in a founded project they are not on.
  - A guest does not.
  - An explicit `projectAdmin: true` survives the merge.
  - The owner may create a ticket in a project nobody put them on.
  - A deleted project stays out of `visibleProjects` and its tickets stay out of the list.
  - The sequence behind W2: a member invited with "All projects" (no project rows) sees every project with no event appended.
  - Rule A does not reach a deleted project: a member not on it cannot see its ticket through `canSee`, and an explicit member still can.
- **The assignee.**
  - A guest assignee's `canSee` is true for that ticket and false for its sibling and its parent.
  - The SQL predicate agrees ticket by ticket.
  - My Work lists it.
  - A note attached to it stays unreadable.
  - Unassigning removes it from My Work.
  - `ticket.assigned` fires a grant notice.
- **Notify on create.** A birth assignee gets one `assignment` row. The actor as assignee gets none. A redelivery gets no second row.
- **Email.**
  - The composed subject and body carry the inviter, workspace, role, link and IST expiry.
  - Email channel: sent once, `emailSent: true`.
  - Phone channel: not sent, `false`.
  - A throwing mailer: 201, `emailSent: false`, the alerter called, the token still spendable.
  - The config default for `INVITE_FROM`.
- **The lookup.** An exact case-insensitive match; a partial email returns `null`; a match returns only the five fields; the lookup is refused for a non-member; a synthetic phone address never matches.
- **The outsider door.**
  - A **member** (not an admin) assigns an outsider: guest granted and ticket assigned.
  - A stand-alone `membership.granted` by the same member is still refused.
  - The outsider then sees that ticket and not its sibling.
  - A refused event leaves no membership.
  - An already-member skips the grant.
- **The UI.**
  - The invite form has no project select and sends no `projectIds`.
  - The result card's two email lines and the phone button label.
  - The lookup line on blur.
  - The picker's outsider arm: found, not found, and an already-member found.
  - The dialog routes an outsider draft through the outsider door.
  - The sheet routes the same way.

## 7. Out of scope

- A data repair of existing roster rows (W2 makes it unnecessary).
- Listing or searching people outside the workspace. Ruling 5 replaced the list with an exact lookup.
- Push, SMS or email **notifications**. The in-app inbox is the only notification transport. W5 emails the invitation, not notifications.
- An HTML invitation email (D4).
- Making the rollup and the restricted-parent chip assignee-aware (§4.3, residuals).

## 8. Deviations the planner took (each is in the plan's Recorded deviations)

- **D1 — the owner is in rule A's set.** "Owner unchanged" holds for reads, since the owner already reads everything. It does not hold for writes: `check-permission.ts:1367` refuses the owner `ticket.created` in a project nobody put them on (there is no owner exemption), so without D1 rule A would let an admin create where the owner could not.
- **D2 — the invite form's project select is removed** (the brief's recommendation), and `projectIds` stays accepted by the schema and the route.
- **D3 — one lookup route for both uses**, gated on membership rather than admin. The invite form is drawn only for owners and admins anyway (`members/page.tsx` `adminGate`), so an admin-only copy of the route would be a second answer to one question.
- **D4 — the invitation email is plain text only**, not "plain text + minimal HTML". The link is the credential, and the magic-link sender's own reason for plain text applies word for word (`auth/smtp-magic-link-sender.ts:89-95`): an HTML body invites a mail client to rewrite or wrap the link.
- **D5 — the outsider grant is a server route, not a paired batch.** Checks cannot see their batch (`ingest-service.ts:432-446`). Compensation (§4.7 step 8) stands in for atomicity. The window between grant and assignment is two sequential commits on one request.
- **D6 — the assignee arm is an `EXISTS` subquery on `v.ticket_id`**, not `t.assignee_id = $viewer`, because `listVisibleTickets` joins no `t`.

The plan records five more, at implementation level: D7 (`NOT_ON_PROJECT_REASON` becomes unreachable), D8 (no "Not in this workspace" list), D9 (the lookup's rate-limit bucket and CSRF entry), D10 (the result card keys on the channel) and D11 (the reopen path stays on the plain door).
