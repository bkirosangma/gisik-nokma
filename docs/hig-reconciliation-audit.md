# HIG reconciliation audit — 23 prototypes against the real product

*2026-09-08. Read-only. Produced before any per-screen restyling, which is the whole point of it:
the dispatch's requirement 1 is that **no working feature is removed to match a picture**, and this is the
document that says which features those are.*

## The headline

**23 of the 23 mapped prototypes BOTH invent functionality that does not exist AND omit
functionality that does.** Across the set: **108 invented** items, **116 dropped** items, **50 copy**
divergences, **49 styling** notes.

**There is no prototype that can be applied literally without either building something the product
cannot do or deleting something it can.** That is not a criticism of the prototypes — they are a visual
language exploration, and as that they are usable. It is the reason the audit had to come before the
restyle rather than after.

## READ THIS FIRST — the four things that would do real damage

**1. `SignIn` would delete three of four working sign-in methods and add one that has never existed.**
The prototype shows `Magic link | Password`. The product ships **Phone OTP (the DEFAULT tab), Email
link, Continue with Google, and Sign in with a passkey** — and `emailAndPassword` is explicitly
`{ enabled: false }` in `auth.ts`, so **Password cannot be built without adding an auth method the
spec forbids.** Applying this prototype literally is not a restyle, it is an outage.

**2. `Members` would delete the role gate.** The real page runs a three-state admin check
(`asking` / `admin` / `member` with explanation / `failed` with a refusal panel) and the full
invitation-minting form with its channel and role selectors. The prototype shows a populated table and
nothing else. **A permission control that is invisible in the mockup is a permission control someone
deletes while "matching the design".**

**3. THE PROTOTYPES ARE HAPPY-PATH ONLY, and this is the systematic finding rather than a per-screen
one.** 41 of the 115 dropped items are **loading, empty, signed-out, expired, refusal or
error states**. Not one prototype depicts a failure. This product's whole character is in those states —
a refusal that says why, an empty state that tells you what to do next, a server message carried
verbatim rather than replaced with "something went wrong". **Restyling from these mockups without the
audit would have quietly removed the honesty machinery and left the happy path.**

**4. There is a fourth view with no prototype at all.** `/w/[workspaceId]/p/[projectId]` registers
**four** view tabs at `page.tsx:505` — Board, **List**, Calendar, Timeline. Three have artboards; `List`
has none. Verified rather than assumed, and it is the kind of gap that reads as "not designed yet" or as
"deliberately removed" depending on who finds it. It is the former.

## How to read the columns

| | meaning | what to do |
|---|---|---|
| **S** | styling only — colour, spacing, radius, type, fill-vs-border | **adopt** |
| **I** | invented — shown in the prototype, does not exist in the product | **do not build**; listed so nobody builds it by accident |
| **D** | dropped — exists in the product, absent from the prototype | **keep and RESTYLE, never delete** |
| **C** | copy — wording differs from shipped text | **flag to the owner**; shipped copy is never silently reworded |

## What I verified myself rather than taking from the sweep

The audit was produced by six parallel readers, one per prototype group. **Agent output is a claim, not
evidence**, so the load-bearing ones were re-checked by hand against source before this document shipped:

* `apps/server/src/auth/auth.ts:84` — `emailAndPassword: { enabled: false }, // the spec forbids passwords`.
  The comment says it outright.
* `apps/web/app/sign-in/page.tsx` — `.magicLink(...)` at :180, `.social({ provider: 'google' ... })` at
  :196, `signIn.passkey`, and the phone branch. **Four methods, confirmed individually.**
* `members/page.tsx:75-77` — `adminGate` with exactly the four states the audit names.
* `p/[projectId]/page.tsx` — `setView('board' | 'list' | 'calendar' | 'timeline')`. **Four, and `list`
  is there.**
* And `/sign-in` was opened in a browser and read directly, which is where the prototype's absent
  tagline and legal links were confirmed absent from the real page too (0 matches each).

The `SignIn` row was used as a known-answer control: the dispatch had already stated that finding, so
the group that produced it could be checked against an answer nobody had given the agent. It matched.

## The table

| prototype | real surface | map | S | I | D | C |
|---|---|---|--:|--:|--:|--:|
| `SignIn` | apps/web/app/sign-in/page.tsx | ✅ verified | 1 | **4** | **5** | 1 |
| `Workspaces` | apps/web/app/workspaces/page.tsx | ✅ verified | 2 | **5** | **6** | 1 |
| `Members` | apps/web/app/w/[workspaceId]/members/page.tsx | ✅ verified | 2 | **6** | **6** | 3 |
| `Invite` | apps/web/app/invite/[token]/page.tsx | ✅ verified | 1 | **6** | **4** | 3 |
| `MobileBoard` | apps/mobile/src/screens/board-screen.tsx (rendered as the "Board" Stac | ✅ verified | 4 | **6** | **2** | 1 |
| `MobileHelp` | apps/mobile/src/screens/help-screen.tsx (rendered as the "Help" Stack. | ✅ verified | 3 | **3** | **1** | 1 |
| `MobileTicket` | apps/mobile/src/screens/ticket-screen.tsx (rendered as the "Ticket" St | ✅ verified | 3 | **6** | **5** | 1 |
| `overflow-check` | UNMAPPED | ⛔ UNMAPPED | 0 | **0** | **0** | 0 |
| `McpAuthorize` | apps/web/app/mcp/authorize/page.tsx | ✅ verified | 2 | **6** | **7** | 4 |
| `McpTokens` | apps/web/app/mcp/tokens/page.tsx | ✅ verified | 1 | **8** | **7** | 3 |
| `Legal` | /privacy | ✅ verified | 2 | **4** | **8** | 4 |
| `Legal` | /terms | 🟡 probable | 1 | **2** | **2** | 1 |
| `Main` | UNMAPPED | ⛔ UNMAPPED | 0 | **0** | **0** | 0 |
| `Board` | apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx (view==='board' ar | ✅ verified | 2 | **7** | **7** | 2 |
| `Calendar` | apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx (view==='calendar' | ✅ verified | 2 | **3** | **5** | 0 |
| `Timeline` | apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx (view==='timeline' | ✅ verified | 2 | **3** | **5** | 1 |
| `TicketSheet` | packages/app-core/src/views/ticket-sheet.tsx TicketSheet, mounted from | ✅ verified | 2 | **5** | **4** | 0 |
| `TicketTypes` | apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx -> package | ✅ verified | 2 | **4** | **3** | 3 |
| `TicketTypeEditor` | apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx a | ✅ verified | 2 | **5** | **8** | 3 |
| `Workflows` | apps/web/app/w/[workspaceId]/settings/workflows/page.tsx -> packages/a | ✅ verified | 1 | **7** | **4** | 2 |
| `WorkflowBuilder` | apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx  | ✅ verified | 2 | **3** | **7** | 3 |
| `MyWork` | apps/web/app/w/[workspaceId]/my-work/page.tsx | ✅ verified | 3 | **6** | **7** | 3 |
| `Inbox` | apps/web/app/inbox/page.tsx | ✅ verified | 3 | **4** | **5** | 3 |
| `Help` | apps/web/app/help/page.tsx | ✅ verified | 4 | **3** | **5** | 3 |
| `NotFound` | apps/web/app/not-found.tsx | ✅ verified | 2 | **2** | **3** | 4 |

**Mapping is not 1:1 and that was verified, not assumed.** `Board`, `Calendar` and `Timeline` are
view-states of the ONE route `/w/[workspaceId]/p/[projectId]` — confirmed at `page.tsx:505`, which
registers four view tabs. **The fourth is `List`, and it has no prototype at all.** `Legal` covers two
routes and gets two rows. `Main` and `overflow-check` map to no product surface and say so rather than
being forced into one.

## Every finding, per prototype

### `SignIn` → apps/web/app/sign-in/page.tsx

*Mapping: **verified**. Route /sign-in has exactly one page.tsx; prototype title 'Gisik Nokma' + magic-link form matches SignInForm's email-link branch (page.tsx:163-190).*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* Phone/OTP sign-in entirely: phone number input, 'Send code' button, one-time-code input, 'Verify and sign in' button (page.tsx:119-162) — this is the DEFAULT method (useState<Method>('phone')) and prototype shows no phone option at all, only shows an email-link-style single field.
* 'Continue with Google' social sign-in button (page.tsx:193-203, authClient.signIn.social).
* 'Sign in with a passkey' button (page.tsx:204-213, authClient.signIn.passkey()).
* Inline error/refusal display: role=alert paragraph shown on any auth failure (page.tsx:216-220) — prototype has no error state.
* '?next=' redirect-preserving behavior and the post-send confirmation copy 'Check your inbox — the link signs you in.' (page.tsx:173-174) shown after magic-link send — prototype's button has no post-click state at all.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* 'Password' as a second sign-in tab (line 68) — no password auth exists anywhere in this file or authClient usage; the real second tab is 'Email link', not 'Password'.
* Prototype only shows ONE method pair (Magic link / Password); real page's default/first tab is Phone (SMS OTP via authClient.phoneNumber, page.tsx:119-162) which the prototype omits as a tab option entirely — it isn't even the alternate tab, it's absent.
* Footer legal links 'Terms' and 'Privacy notice' (lines 84-86) — no such links or copy appear anywhere in page.tsx; there are standalone /terms and /privacy routes but this page does not link to them.
* Subtitle 'The keeper of memory' under the H1 (line 62) — real page renders only <h1 class=gn-page-title>Gisik Nokma</h1> (page.tsx:98), no subtitle.

**C — copy differs. Flag, never silently reword.**

* Prototype helper text 'We'll email you a link that signs you in. It expires in 15 minutes.' (line 79-81) does not appear in the real page's copy at all — the real confirmation string is 'Check your inbox — the link signs you in.' (page.tsx:174). Different wording for what is arguably the same moment; flag before adopting either as canonical.

**S — styling only. Adopt.**

* Prototype uses a segmented pill control for method switch (helmet .seg, lines 40-45,66-69); real uses role=tablist buttons styled via gn-view-tabs class (page.tsx:100-117) — same ARIA pattern, different visual treatment, adoptable as pure CSS.

> The prototype models a hypothetical two-method (magic-link/password) sign-in screen. The real screen is a four-method screen (phone OTP, email magic-link, Google OAuth, passkey) with none of those methods named 'password'. This is the single largest invented/dropped gap in the four prototypes reviewed — restyling this prototype 1:1 would delete three of four working auth methods and add a password flow that has never existed.

### `Workspaces` → apps/web/app/workspaces/page.tsx

*Mapping: **verified**. Route /workspaces has exactly one page.tsx; prototype nav item 'Workspaces' is marked .on and prototype H1 'Workspaces' matches page.tsx:41 gn-page-title.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* ThemeToggle control in the nav (app-nav.tsx:26) — no theme control anywhere in the prototype.
* Inbox unread-count badge (InboxNavLink → UnreadBadge, apps/web/src/inbox-nav-link.tsx:99-103) — prototype's 'Inbox' link is plain text, no live badge.
* Personalized header ' — {user.name}' appended to 'Workspaces' title (page.tsx:41) when signed in.
* Full loading/error/empty state machine: 'Loading…', ShellRefusal panel on data-fetch failure, ExpiredSessionNotice on 401, and the empty-state copy 'No workspaces yet. Ask an admin for an invite link — or create your own.' (page.tsx:47-57) — prototype shows only the populated happy path.
* The inline 'New workspace' FOUNDING FORM: a persistent Name field + 'Create workspace' submit + per-field server refusal display (FoundingForm, page.tsx:108-154) — prototype reduces this to a single 'New workspace' button (line 70) with no visible form or refusal handling behind it.
* Per-workspace navigation into each project and into 'My Work' (Link href per project, page.tsx:65-71) — prototype cards show no project list or per-project links at all, just the workspace name/stat block.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Workspace card stats that have no backing field: member count ('12 members'), project count as a number chip, ticket status chips ('28 active'/'2 blocked'/'9 active'/'3 pending'/'Restricted fields'), and the viewer's role label ('admin'/'member'/'guest') per workspace (lines 76-117) — WorkspaceRef is `{ id, name, projects }` only (packages/app-core/src/view-types.ts:5), carrying no member count, no ticket stats, and no role.
* Colored initials tile per workspace (e.g. '#0040DD'/'#1E7A34'/'#8944AB' backgrounds, lines 77,92,107) — no avatar/color data exists on WorkspaceRef.
* 'One invitation is waiting' banner with Accept/Decline buttons (lines 121-136) — nothing in workspaces/page.tsx reads or renders pending invitations; invitation accept/decline only exists at the separate /invite/[token] route (apps/web/app/invite/[token]/page.tsx), never surfaced inline on the workspace list.
* 'Help' nav link (line 59 of prior Members prototype pattern doesn't apply here, but Workspaces prototype nav has no Help — correction, this prototype's nav is Workspaces/Inbox/Help/spacer/avatar, line 56-61) — AppNav (apps/web/src/app-nav.tsx:14-39) renders exactly Workspaces, My Work (conditional), Inbox — no Help link, ever (pinned by test case 11.185 'hangs exactly three doors and no more').
* Avatar circle with initials ('AK') next to 'Sign out' (line 61) — real Sign out button is plain text 'Sign out {user.name}' (app-nav.tsx:35), no avatar element.

**C — copy differs. Flag, never silently reword.**

* Prototype subtitle 'Three workspaces you belong to.' (line 68) has no counterpart in real copy; the real page has no descriptive subtitle line under the H1 at all.

**S — styling only. Adopt.**

* Nav bar layout/avatar-chip look (helmet .nav, lines 34-40) vs real gn-nav class (app-nav.tsx) — same link set minus items called out below; adoptable as CSS.
* Card grid layout with colored initials tile (lines 48-51, 75-117) vs real's plain <Card> per workspace (page.tsx:59-76) — the container/shape is a styling choice as long as the underlying data shown matches WorkspaceRef; see invented items below for the data itself.

> WorkspaceRef's minimal shape ({id, name, projects}) means essentially every metric shown on the prototype's cards (member counts, ticket stats, role) is invented and has no server-side source in this codebase today — restyling these cards must not silently promise numbers the app cannot produce.

### `Members` → apps/web/app/w/[workspaceId]/members/page.tsx

*Mapping: **verified**. Nav item 'Members' marked .on in prototype; real route apps/web/app/w/[workspaceId]/members/page.tsx exports MembersPage with H1 rendering 'People' and a roster list — the only members-shaped surface in the route list.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* The entire role-gated admin/member split: three-state adminGate ('asking' / 'admin' / 'member' with explanation text / 'failed' with ShellRefusal) (page.tsx:75-107,192-211) — prototype shows the invite UI and pending list to everyone unconditionally, with no 403/member-only rendering at all.
* The full mint-invitation FORM: address, channel (email/sms/whatsapp), role (admin/member/guest, no owner option), optional comma-separated project ids (hidden for guest role), submit button, one-time-copy result card with the exact warning string 'Copy it now — it is not stored and cannot be shown again' plus the minted URL and formatted expiry, and server-refusal display (MintForm, page.tsx:236-344) — prototype reduces all of this to a bare 'Invite people' button (line 71) with no form behind it shown.
* Per-pending-invite 'invitedBy' attribution — PendingInvite DOES carry an `invitedBy` field (packages/app-core/src/online/invites-admin.ts:24) but MembersPage's PendingList does not currently render it (page.tsx:365-380); the prototype's 'Invited by Meena'/'Invited by Anjali' copy (lines 122,128) happens to match an available-but-unused field rather than an invented one — flagging as dropped display of real data, not as invented.
* The 'no link behind this one — withdraw it and invite again' dead-mint-residue message for a pending row with `expiresAt: null` (page.tsx:372-374) and the empty-pending-list sentence 'No invitations are outstanding.' (page.tsx:363) — prototype always shows two populated pending rows, no empty or dead-residue state.
* Roster loading/error states: 'Loading…' and ShellRefusal on getMembers failure (page.tsx:178-190) — prototype shows only the populated table.
* revokeRefusal display on a failed Withdraw (page.tsx:205-209) — no error state shown in prototype's Resend/Revoke row actions.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Per-member avatar initials circle, email address, join date ('12 Mar 2026'), assigned-ticket count ('11 tickets'), and 'Last seen' timestamp ('Now'/'14 min ago') (lines 80-113) — Actor is `{ id, name }` only (packages/app-core/src/view-types.ts:3); none of email, joined date, assignment count, or last-seen exist on the type or are fetched by MembersPage. **PARTLY SUPERSEDED 2026-09-18 (executor 2):** the **initials circle IS now built** — it is DERIVED from the `name` the wire does carry, so it never needed a new field, and this bullet's own premise ("Actor is `{ id, name }` only") was true while the circle was still buildable from exactly that. Email, join date, assignment count and last-seen remain unbuilt and correctly refused: no such field is on `readMembers`' SELECT (`apps/server/src/routes/builder-reads.ts:247`).
* Per-member role pill ('Admin'/'Member'/'Guest') on the roster table (lines 83,90,97,104,111) — **CORRECTED 2026-09-18 (executor 2). This bullet was FALSE, and it is the source of a wrong belief that outlived it.** It claimed "the roster (`members`, Actor[]) carries no role field at all". The roster carried `role` the whole time: `readMembers` selects `m.role` and returns it (`apps/server/src/routes/builder-reads.ts:247`, `:256-260`), the wire type requires it (`packages/domain/src/read-models.ts:547`), the column is `NOT NULL CHECK (role IN ('owner','admin','member','guest'))`, and case **7.39** (`apps/server/test/routes/builder-reads.test.ts:283`) asserted it on `main` throughout. The bullet conflated *the client's `Actor` type has no room for it* with *the server does not send it* — the identical conflation the old `mapActors` docblock made. What was actually missing was a **read**: the mapper dropped the field. That is now fixed and the role renders as a **read-only chip** (cases 13.760–13.766). **Still correctly refused, and unchanged:** the prototype's per-member role `<select>`, because there is no role-change door and no last-owner guard on `membership.granted` — a control that could let an admin demote the sole owner is not a screen-restyle decision.
* 'Resend' button on each pending invitation (lines 123,129) — PendingList (page.tsx:355-381) renders only a single 'Withdraw' action per row; there is no resend affordance or gateway method visible in invitesAdmin usage here.
* Nav items 'Board', 'Settings', and 'Help' plus the Inbox numeric badge shown as a static '7' (lines 58-59) — AppNav with a workspaceId renders exactly Workspaces / My Work / Inbox (live badge) / ThemeToggle / Sign out (apps/web/src/app-nav.tsx:14-39); there is no persistent Board or Settings link and no Help link anywhere in AppNav (case 11.185 pins exactly three doors).
* Avatar circle before 'Sign out' text in the nav (line 61) — real Sign out is plain text only.
* Subtitle 'Twelve people in Meghalaya Rollout.' and section heading 'Pending invitations · 2' with a live count (lines 69,118) — no such copy/count line exists in MembersPage; the real 'no pending' state is instead the sentence 'No invitations are outstanding.' (page.tsx:363). **PARTLY SUPERSEDED 2026-09-20 (executor 2): the section heading with a live count NOW EXISTS** — `PendingList` draws `<h2 className="gn-invite-pending__heading">` reading `Pending invitations · N` from the same array the list renders (case `16.46`), the authority's own string (`desktop.dc.html:725`, defined `:3091`). **The SUBTITLE half still holds**: 'Twelve people in Meghalaya Rollout.' exists nowhere, and the summary line is derived from the roster rather than literal. The 'no pending' sentence is unchanged but now sits at `page.tsx:982`; this bullet's `:363` is one of this document's 2026-09-08 line numbers, and it had drifted before this change, not because of it.

**C — copy differs. Flag, never silently reword.**

* Page title: prototype 'Members' (line 68) vs real H1 'People' (page.tsx:176) — different noun for the same screen; do not silently pick one when restyling.
* Action label: prototype 'Revoke' (line 124,130) vs real 'Withdraw' (page.tsx:376) for the identical action (submits invite.revoked).
* Expiry phrasing: prototype relative/colored 'expires in 4 days' / 'expires tomorrow' with warning color near expiry (lines 122,128) vs real's absolute formatted timestamp via formatDateTime, 'Lapses {date}' (page.tsx:374), with no proximity-based coloring.

**S — styling only. Adopt.**

* Table layout with header row, zebra striping, avatar circles, and colored role pills (helmet .table/.pill/.avatar, lines 44-52,74-115) vs real's plain <ul className=gn-members> of member.name only (page.tsx:183-190) — the table CHROME is a styling choice, but see invented items: most of the data it displays doesn't exist to be styled.
* Pending-invitations panel container/list styling (lines 117-133) vs real's <ul className=gn-invite-pending> (PendingList, page.tsx:365-380) — same general shape (list of pending rows with an action), differing per-row content noted below.

> This prototype most directly risks requirement 1: its roster table implies a whole set of member-level data (role, email, ticket load, presence) that the Actor type cannot supply today, and its invite section drops the entire role-gated mint form and permission-state machine that is this page's actual functional core.

### `Invite` → apps/web/app/invite/[token]/page.tsx

*Mapping: **verified**. Route /invite/[token] has exactly one page.tsx (InvitePage); prototype's 'Join {workspace}' framing and Accept/Decline pair map to InvitePage's populated-invite branch (page.tsx:98-123).*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* The three-state invite-load machine: 'Checking the invitation…' while loading, and the dead-link state 'This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new one.' when the token 404s or the transport fails (page.tsx:91-97) — prototype shows only the populated/live-invite state, no loading or dead-link rendering.
* The signed-out branch: 'Sign in to accept' link that preserves `?next=/invite/{token}` plus the copy 'any of the four sign-in methods works; you land back here' (page.tsx:103-111) — prototype assumes the viewer is already signed in ('signed in as priya@example.com', line 91) and never shows a sign-in prompt.
* The session-loading sub-state 'Checking whether you are signed in…' (page.tsx:103-104) nested inside the populated-invite branch.
* Accept-failure refusal text carrying the server's own message, or the fallback 'This invitation could not be accepted, and the server did not say why. Ask whoever invited you for a fresh link.' (page.tsx:78-83,117-121) — prototype's Accept button has no visible failure state.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Inviter identity block: avatar initials 'AK', name 'Anjali Kharkongor', email 'anjali@example.com', and their role 'admin' (lines 63-68) — InviteSummary is `{ workspaceId, workspaceName, role }` only (packages/app-core/src/online/invites.ts:3-7); there is no inviter name, email, or role anywhere in the fetched data or page.tsx.
* 'Members' fact row showing a live count ('12') (line 74) — no member count is part of InviteSummary or fetched by this page.
* 'Invitation expires' fact row with a relative/colored countdown ('In 4 days') (lines 75-76) — InviteSummary carries no expiry field at all; the real page cannot know or show an expiry.
* 'What a member can do' permissions-explainer panel (lines 80-84) — no such copy or permission-summary block exists in InvitePage.
* 'Decline' button (line 87) — InvitePage offers no decline action; the only actions are 'Join {workspaceName}' (accept) or, if signed out, 'Sign in to accept' (page.tsx:107-116). There is no reject/decline endpoint call anywhere in this file.
* Footer line '"You're signed in as {email}. Use a different account"' (lines 91-92) — no account-switch affordance or currently-signed-in-as display exists in InvitePage.

**C — copy differs. Flag, never silently reword.**

* Title: prototype 'Join {workspaceName}' (line 57) vs real generic H1 'Gisik Nokma' (page.tsx:89) — real page does not personalize the page title to the workspace at all.
* Body: prototype 'Anjali invited you to a workspace on Gisik Nokma.' (line 58) vs real 'You are invited to join {workspaceName} as {role}.' (page.tsx:100-102) — different sentence, different information (real names the role, prototype doesn't put it in the main sentence).
* Accept button: prototype 'Accept invitation' (line 88) vs real 'Join {workspaceName}' (page.tsx:114) — different label for the identical action.

**S — styling only. Adopt.**

* Centered single-card layout, icon badge, 'fact' rows (helmet .fact, lines 37-39,71-77) vs real's plain <Card className=gn-invite> with paragraph text (page.tsx:90-124) — layout/visual treatment is adoptable as long as the fields shown are ones InviteSummary actually has.

> InviteSummary's three-field shape means every relationship/identity fact this prototype displays about the inviter, membership count, and expiry is invented; more importantly the prototype has no signed-out path at all, while the real page's signed-out branch (with the next= redirect) is the ordinary way most invite links are actually opened.

### `MobileBoard` → apps/mobile/src/screens/board-screen.tsx (rendered as the "Board" Stack.Screen in apps/mobile/src/app.tsx:65-81)

*Mapping: **verified**. app.tsx:65 registers Stack.Screen name="Board" rendering BoardScreen; board-screen.tsx:56-68 renders a FlatList of tickets, matching the prototype's ticket-card list. Confirmed 1:1, not shared with any other route.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: the search box (TextInput placeholder="Search", board-screen.tsx:54) and the "searching offline copy" honesty notice (line 55) — real, wired functionality (ds.query.searchOfflineCopy, lines 28-37) with no equivalent element anywhere in the prototype.
* D: the failed-claims line — `{props.failed} needs attention` (board-screen.tsx:53), shown whenever a queued claim failed to sync — has no counterpart in the prototype's sync strip, which only shows a generic "Offline · 2 claims queued" band.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: bottom tab bar with 4 destinations (Board / My work / Inbox / Help), lines 133-152. apps/mobile/src/app.tsx uses createNativeStackNavigator with exactly 3 screens (Board, Help, Ticket) — no createBottomTabNavigator, no Tab.Navigator anywhere in apps/mobile/src (grep confirmed zero hits). 'My work' and 'Inbox' are web-only routes (/w/[workspaceId]/my-work, /inbox per the given route list) with no mobile equivalent at all.
* I: FAB "New ticket" button (line 128-131). No ticket-creation code path exists anywhere in apps/mobile/src (grep for createTicket/'New ticket' returns nothing); board-screen.tsx's FlatList has no onCreate affordance.
* I: horizontal state-filter scroller with per-state ticket counts ("In progress · 3", "Triage · 4", etc., lines 68-74). board-screen.tsx has no per-state grouping or filter UI at all — it renders one flat FlatList of all ticket summaries for the workspace, filtered only by free-text `query` (line 17,54).
* I: "Meghalaya Rollout / Sprint 14" project+sprint header lockup (lines 60-65). TicketSummary (packages/app-core/src/replica/replica-data-source.ts:142-159) has no sprint field at all — only ticketId/projectId/title/stateId/stateCategory/assigneeId/parentId/pending/pendingEventIds/openContests. There is no sprint concept plumbed to mobile.
* I: 34px circular avatar/initials button in the header ("AK", lines 63-64) as an implied account/profile affordance. app.tsx's header only renders a plain "Help" text link (lines 69-77); there is no avatar, account menu, or workspace-switcher element.
* I: rich ticket cards with coloured state-dot chips, a second status chip (e.g. "Contested"/"In transit"), and an assignee avatar circle, plus a due-date/overdue caption (lines 79-116). The real list item (board-screen.tsx:59-66) renders only plain text: `{title} · {stateId}`, plus a conditional line `"claim in transit"` and a conditional line `"N contested"` — no colour-coded chips, no avatar, and no due-date/overdue text (TicketSummary carries no due-date field for the board view).

**C — copy differs. Flag, never silently reword.**

* C: sync-status wording differs. Real copy comes from `syncStatusLabel()` (packages/app-core/src/sync/sync-status-bar.tsx:11-17): e.g. "Offline — 2 claims waiting to send" (single em-dash-joined string, and "Offline" alone with zero queued). The prototype hardcodes two separate spans, "Offline" + "2 claims queued" — different wording ("queued" vs "waiting to send") and different structure (one string vs two).

**S — styling only. Adopt.**

* S: board-screen.tsx has ZERO existing styling — no StyleSheet, no color, no backgroundColor of any kind (confirmed directly in code and by a docblock comment in help-screen.tsx:69 stating this explicitly: "board-screen.tsx and ticket-screen.tsx declare no colours at all"). So this is a from-scratch build, not an override of existing style.
* S: NONE of the prototype's CSS constructs transfer as written to RN — `border-radius`, `box-shadow` (.card, .fab), CSS variables (--surface/--fill1/--accent), `.chip` pill padding, `overflow-x:auto` horizontal scroller, `position:absolute` FAB, `white-space:nowrap` — every one needs a React Native StyleSheet equivalent (borderRadius number, elevation/shadow* props, ScrollView horizontal, position:'absolute', flexWrap etc.).
* S: colour values themselves do not transfer — the prototype hardcodes Apple HIG hex (--accent:#0040DD, --surface:#F2F2F7) while the real app's token system (packages/ui/src/tokens.ts:204-253) uses named roles resolved to a different brand palette (accent: 'blue600' light / 'blue300' dark, surface: 'paper'/'coal', etc., via `colorOf()` from @gisik-nokma/ui/tokens — the same mechanism help-screen.tsx already uses). Only the STRUCTURE (spacing scale, type scale, pill/card shapes) is adoptable; literal hex values are not.
* S (adoptable): the type scale (34/22/17/15/13/12px), 8-12px spacing rhythm, and pill/card radii are reasonable design references once re-expressed through @gisik-nokma/ui/tokens.

> Real screen is currently unstyled scaffolding, so restyling is additive, not a rework — but the invented/dropped list above must be resolved with the product team before any visual work locks in a shape the real screen doesn't have.

### `MobileHelp` → apps/mobile/src/screens/help-screen.tsx (rendered as the "Help" Stack.Screen in apps/mobile/src/app.tsx:89)

*Mapping: **verified**. app.tsx:89 registers Stack.Screen name="Help" component={HelpScreen}, reachable from Board's header (app.tsx:69-77). help-screen.tsx renders a search box + Manual/FAQ tabs, matching the prototype's search+segmented-control layout. 1:1 mapping confirmed.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: live search results UI — match count ("N answers"), per-match title/location/excerpt (help-screen.tsx:262-276), and the explicit no-match empty state ("Nothing matches '…'. All N entries were searched…", lines 279-288). The prototype's search box (lines 59-64) is decorative placeholder text only ("Search the manual") with no results state shown at all — real, wired search functionality is completely absent from the mockup.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: the entire "grouped disclosure list" navigation pattern (lines 76-107) — rows like "Getting started ›", "Workspaces and roles ›" that imply tapping navigates to a dedicated sub-page. The real screen has no drill-down navigation at all: content is rendered inline in one continuous scroll — h2 section titles, h3 entry titles, and paragraph/list/quote/table blocks (help-screen.tsx:306-322, via `HELP_CONTENT`/`Blocks`). There is no per-topic destination screen to navigate to.
* I: the callout card "A claim in transit is the same claim" with an inline "Read 'Working offline'" link (lines 110-116) as a curated, hand-picked highlight. The real screen has no editorially-curated callout — all content comes uniformly from the same `HELP_CONTENT` data structure that also drives the web/desktop help browser (per the file's own docblock, lines 21-30: "this screen reads exactly the same HELP_CONTENT... a sentence cannot say one thing on a laptop and another on a phone"). A hand-authored callout box would fork that guarantee.
* I: bottom tab bar (Board/My work/Inbox/Help), lines 120-139 — same finding as MobileBoard: no Tab.Navigator, no My Work/Inbox screens exist in apps/mobile/src at all.

**C — copy differs. Flag, never silently reword.**

* C: section names differ. Prototype's "Start here" group lists "Getting started / Workspaces and roles / Tickets / Boards and views"; "When things get complicated" lists "Working offline / Dates and claims / Workflows / Visibility and restricted fields". These exact section/entry titles are not verifiable against real content because `HELP_CONTENT` is data (not inspected here as it lives outside `apps/mobile/src`), but the prototype's two-bucket taxonomy ("Start here" vs "When things get complicated") has no counterpart in help-screen.tsx's render, which walks `active.sections` flatly with no such grouping labels — so at minimum this bucketing is invented structure, and the section copy itself is unverified against the real HELP_CONTENT data and must not be assumed correct.

**S — styling only. Adopt.**

* S: help-screen.tsx already HAS a real styling layer (StyleSheet.create at makeHelpStyles, lines 85-140) driven by @gisik-nokma/ui/tokens via help-theme.ts's helpPalette() — unlike Board/Ticket this screen is not a blank slate. Any restyle must go through `colorOf(theme, role)` (help-theme.ts:26-46), never a literal hex, per the token-discipline scan noted in the file's own docblock (lines 58-61) which turns the branch red on a hardcoded colour.
* S: the prototype's CSS constructs (fill-based `.grow:nth-child(even)` zebra rows, `.group{overflow:hidden;border-radius}`, box-shadow segmented control, CSS custom properties) do not transfer to RN as-is; the real screen already uses borderWidth/borderColor (help-screen.tsx:92-120) rather than translucent fills, which is a materially different visual language from the prototype's iOS-fill cards — reconciling the two is a real decision, not a mechanical port.
* S: help-screen.tsx already supports light/dark via useColorScheme() (line 245) with tokens for both themes (SHEETS, line 148); the prototype is light-mode only and has no dark-theme variant to check against.

> This is the one screen with a pre-existing real style layer and light/dark support — treat it as an extension of that system (via colorOf/@gisik-nokma/ui/tokens), not a fresh build.

### `MobileTicket` → apps/mobile/src/screens/ticket-screen.tsx (rendered as the "Ticket" Stack.Screen in apps/mobile/src/app.tsx:90-92, reached from BoardScreen's row tap)

*Mapping: **verified**. app.tsx:90 registers Stack.Screen name="Ticket" rendering TicketScreen; board-screen.tsx:60 navigates to it with a ticketId param on row tap. ticket-screen.tsx renders title/state/contests/comment editor, matching the prototype's ticket-detail layout. 1:1 mapping confirmed.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: multi-contest rendering — `openContests.map(...)` (ticket-screen.tsx:107-123) loops over EVERY open contest, each with its own alert, explanatory text (via `renderContestedClaimText`), and three action buttons. The prototype hardcodes exactly one contest card and cannot represent zero or multiple.
* D: the three real resolution actions themselves — "Redo legally" (onRedo, lines 82-92, which rebuilds a fresh envelope because resolveContest rejects the original claim's id back), "Convert to comment" (line 120), and "Discard" with a native confirm Alert ("Discard claim? This cannot be undone", lines 94-99) — none of these three real actions/wording appear in the prototype at all.
* D: the rich-text comment editor (`EditorWebView`, line 124) and the "Comment" submit button (line 126) — the entire comment-composition surface is completely absent from the mockup.
* D: inline error surfacing — `{error !== null ? <Text accessibilityRole="alert">{error}</Text> : null}` (line 125), shown when a comment or contest-resolution is refused by the server (e.g. a stale/invalid resolution). No error/refusal state appears anywhere in the prototype.
* D: "claim in transit" pending-state annotation (`ticket.pending !== null`, line 105) — rendered inline next to state; the prototype instead recolors the "Rollout date" field purple with an "in transit" caption (lines 112-113), which is a different field being marked pending, not the ticket's own state.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: the "Two devices disagree" contest-resolution UI (lines 88-97) offering "Keep mine (11:12)" / "Keep theirs (11:09)" / "Discard mine" — a side-by-side yours-vs-theirs comparison with timestamps. This does not match how contest resolution actually works: ticket-screen.tsx's `onResolve`/`onRedo`/`onDiscard` (lines 63-99) call `resolveContest` with exactly three real resolution kinds — 'redone' ("Redo legally"), 'converted-to-comment' ("Convert to comment"), 'discarded' ("Discard") — against ONE original claim per contest, not a chosen-side comparison. There is no "keep theirs" concept in the domain at all.
* I: "Type: Defect" / "Priority: P1" / "Rollout date: 14 Sep" / "Blocks: GN-1190, GN-1176" detail-list rows (lines 108-116). Checked against packages/domain/src/ticket-types.ts:4-7 — CUSTOM_FIELD_KINDS is only `['text','number','date','select','person']` and BUILTIN_FIELD_IDS is only `['title','description','dueDate','startDate']`. There is no ticket-to-ticket "blocks/blocked-by" relationship field kind in the schema at all — that specific relationship cannot exist today, invented outright. "Priority"/"Rollout date" could theoretically be workspace-defined custom select/date fields with those names, but nothing in ticket-screen.tsx renders ANY custom field — the screen shows only title and state.
* I: "Move to" quick-transition buttons ("Blocked" / "In review", lines 118-124). ticket-screen.tsx has no state-transition handler of any kind — no onMove, no workflow-transition call anywhere in the file.
* I: History and Files tabs in the segmented control (lines 99-103, only "Details" is real). No history/audit-log or file-attachment UI exists in ticket-screen.tsx.
* I: navbar back-link styled as "‹ Board" plus a "…" more-actions menu (lines 62-70). react-navigation's native-stack supplies its own default header/back-chevron automatically; this custom navbar with a distinct overflow menu has no wired action behind it in the code.
* I: assignee display as a named chip with avatar ("AK Anjali", line 83). ticket-screen.tsx never renders assignee at all — not even the raw id — anywhere in its output.

**C — copy differs. Flag, never silently reword.**

* C: state display differs — real screen prints the raw `state?.stateId` (line 104, e.g. likely a slug like "in-progress") with no styling, versus the prototype's title-cased chip "In progress". Whether the real stateId is human-formatted anywhere upstream was not verified in this file and should not be assumed.

**S — styling only. Adopt.**

* S: ticket-screen.tsx has ZERO existing styling (no StyleSheet/color/backgroundColor anywhere in the file) — confirmed directly and by the same cross-file docblock comment cited for board-screen.tsx (help-screen.tsx:69). This is a from-scratch build against unstyled RN primitives (Text/View/Button/ScrollView).
* S: prototype CSS (`.group` zebra card, `.chip`/`.dot` state pills, `.seg` segmented control, `.btn`/`.btn--primary`/`.btn--danger` fill styles, box-shadows, CSS vars) needs full RN re-expression via @gisik-nokma/ui/tokens roles, same caveat as MobileBoard — no literal hex or CSS shadow syntax transfers.
* S (adoptable): type scale and spacing rhythm are consistent with the other two prototypes and can inform a shared RN component set once tokenised.

> This prototype has the largest gap between shown and real functionality of the three: it invents an entire alternate contest-resolution mechanism (keep-mine/keep-theirs) in place of the real one (redo/convert/discard), and invents several detail fields (Priority, Blocks, Rollout date) that either don't exist in the schema (Blocks) or simply aren't rendered by this screen today.

### `overflow-check` → UNMAPPED

*Mapping: **unmapped**. Not a product mockup at all — it is a headless test harness (own doc comment, lines 9-11: "Loads every artboard at its canvas.json frame size and reports whether the content overflows the frame... this is the only check that can see it"). It fetches design-system/prototypes/canvas.json, iframes in every artboard file listed there, and measures scrollHeight/scrollWidth against each artboard's declared frame size to detect clipping. It has no UI of its own beyond a monospace `#out` results dump and renders no product screen.*

> Excluded from the S/I/D/C audit — there is no real surface to compare it against. It is design-system tooling (a QA check over the .dc.html artboards themselves, run against canvas.json), not a prototype of a product screen.

### `McpAuthorize` → apps/web/app/mcp/authorize/page.tsx

*Mapping: **verified**. Route name and purpose match exactly (both are the MCP device-authorize consent screen); apps/web/app/mcp/authorize/page.tsx lines 10-43 doc comment confirms this is /mcp/authorize, the WEB_ORIGIN verification URI target.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: Loading state 'Checking your session…' (page.tsx line 119) — entirely absent from the prototype, which assumes an already-authenticated visitor.
* D: Signed-out state with a 'Sign in' link that preserves ?next= redirect back to /mcp/authorize (page.tsx lines 120-127) — the prototype shows no unauthenticated path at all.
* D: Manual code-entry input with label 'Code from your assistant', ?code= query-param prefill, and an accessibility hint 'Eight characters, shown as two groups of four. Upper or lower case both work.' (page.tsx lines 154-178) — replaced in the prototype by a non-interactive confirmation display (see I above); the real typing/validation affordance is dropped.
* D: Submit-button disabled/loading states — disabled while sending or when code is empty, label switches to 'Approving…' (page.tsx lines 180-186) — no equivalent state shown in the static mock.
* D: Post-approval confirmation screen with its own copy: 'Approved. The assistant is connected.', the 'acts as {name}, with exactly your permissions' explanation, and 'This lasts until you revoke it. You can close this page' (page.tsx lines 128-139) — the prototype only depicts the pre-approval ask screen, never the approved state.
* D: Three distinct refusal/error messages for expired code (410), unrecognized/already-used code (404), and an unknown-cause fallback, each rendered with role="alert" (page.tsx lines 94-107, 192-196) — no error state is depicted in the prototype at all.
* D: `actingAs()` empty-name fallback to 'you' (page.tsx lines 63-65), documented as a real bug workaround for magic-link accounts with an empty name string — a correctness-critical detail the static mock has no reason to show but which must never be lost in a restyle.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: Named requesting client 'Claude Desktop' with logo/icon and a two-letter avatar 'CD' (lines 45-56) — the real page never identifies which MCP client is asking; it only asks for a user-entered code (page.tsx lines 154-178). No client-name/client-icon field exists anywhere in the component.
* I: Named target workspace 'Meghalaya Rollout' in the heading subtext (lines 58-59) — the real consent text (page.tsx lines 142-152) is workspace-agnostic; it never names a workspace at all, only 'as {actingAs(session.user.name)}, with exactly your permissions'.
* I: Granular per-scope checklist UI — 'Read tickets, boards and comments', 'Create tickets and move them between states', with two explicit denied items 'Read restricted fields — Never' and 'Invite people or change roles — Never' (lines 63-91). The real page has one undifferentiated consent paragraph (lines 147-152); there is no scope-by-scope grant/deny model in the code at all.
* I: A static 'confirm this code' comparison box with the instruction 'If the codes don't match, deny this request' (lines 93-101) implying the server pre-generates a code for the user to visually match against what the desktop app shows. The real flow is the reverse: an editable text <input id="mcp-user-code"> (page.tsx lines 157-175) that the user themselves types the code into — a materially different security interaction, not just a style choice.
* I: An explicit 'Deny' button (line 104) — the real page has no deny/reject action at all; the only button is 'Approve this assistant' (page.tsx lines 180-186). A user declines simply by not entering a code or navigating away.
* I: Footer link 'You can revoke this any time from Settings > MCP tokens' (line 108) implying MCP tokens live under a Settings section — the real revoke surface is the standalone /mcp/tokens route, explicitly NOT under settings/ (mcp/tokens/page.tsx lines 13-23 explain why it deliberately sits beside /mcp/authorize instead).

**C — copy differs. Flag, never silently reword.**

* C: Heading 'Let Claude Desktop use Gisik Nokma?' vs real 'Connect an assistant' (page.tsx line 115) — different wording, and the real heading is intentionally client-agnostic.
* C: Primary button label 'Allow access' vs real 'Approve this assistant' (page.tsx line 185).
* C: Section label 'It will be able to' (line 63) vs real page has no equivalent scope-section heading since there is no scope list.
* C: 'Confirm the code shown in Claude Desktop' (line 93) vs real input label 'Code from your assistant' (page.tsx line 155) — different framing (confirm vs enter).

**S — styling only. Adopt.**

* Overall visual language (surface/raised/sunken fills, SF Pro-style type ramp, 8/12/16px radii, 44px control heights, blue accent, fill-based separation instead of borders) is adoptable and matches the product's existing --gn- token approach (apps/web/app/globals.css, packages/ui/src/tokens.ts).
* Rounded app-icon glyph + client-icon 'CD' avatar pairing (lines 45-56) is pure chrome and can be restyled without functional impact — but see I below, the client identity itself is invented.

> This prototype depicts a materially different consent model (named client + workspace, itemized granular scopes, code-matching rather than code-entry, explicit Deny) than what is implemented. Restyling must preserve the real single-paragraph consent text, the editable code input, and all four states (loading/signed-out/idle/approved) plus the three refusal messages; none of the prototype's invented scope-list, deny button, or client-identification affordances should be built without a product decision, since none of that functionality exists server-side per the file's own doc comments.

### `McpTokens` → apps/web/app/mcp/tokens/page.tsx

*Mapping: **verified**. Route name and purpose match; mcp/tokens/page.tsx lines 10-36 doc comment identifies this as /mcp/tokens, 'the revoke surface (owner ruling 5, MCP plan Task 12)', explicitly a standalone per-user page, not a workspace settings page.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: Loading state 'Checking your session…' (page.tsx line 121) and the token-list loading state 'Loading…' (line 136) — both absent from the static mock, which assumes data is already populated.
* D: Signed-out state with sign-in link preserving redirect back to /mcp/tokens (page.tsx lines 122-126) — no unauthenticated state shown.
* D: Empty state — 'No assistants are connected. One appears here after you approve it on the connect page' with a link to /mcp/authorize (page.tsx lines 137-141) — the prototype only shows a populated list, never the zero-token case.
* D: Per-row revoke busy/disabled state — button reads 'Revoking…' and all revoke buttons disable while one is in flight (page.tsx lines 157-163) — not depicted.
* D: Ambiguous-404 refusal copy 'That connection is already gone. The list below is up to date.' plus a generic server-refusal fallback, both rendered with role="alert" (page.tsx lines 96-112, 183-187) — no error/refusal state is shown in the mock at all.
* D: The explanatory lead paragraph describing what revoking actually does — 'takes effect at that assistant's next request — nothing is interrupted mid-task' (page.tsx lines 129-133) — this correctness-critical clarification (deliberately called out in the file's own doc comment, lines 31-35) has no equivalent copy in the prototype.
* D: 'Never used' label for a token with `lastUsedAt === null` (page.tsx lines 151-155) — dropped in favor of the invented relative-time display.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: A persistent top app nav bar — 'Board / My work / Inbox / Members / Settings / Help' plus avatar+'Sign out' (lines 62-67) — does not exist anywhere in the product. Verified: apps/web/app/layout.tsx (the only layout.tsx in the whole app) renders no nav chrome, and no page.tsx under apps/web/app uses anything besides the plain `.gn-shell` container class (defined in apps/web/app/globals.css:51 as just `max-width` + `padding`, no nav markup). Every one of the 19 routes renders its own bare `<main className="gn-shell">`.
* I: A Settings sidebar with items 'Ticket types / Workflows / Fields / Visibility / MCP tokens / Danger zone' (lines 72-73) implying MCP tokens live inside a Settings section with sub-nav. This contradicts both the file's own doc comment (mcp/tokens/page.tsx lines 13-23, which explains at length why this is deliberately NOT under settings/) and the verified route list, which has only ticket-types and workflows under /w/[workspaceId]/settings/ — 'Fields', 'Visibility', and 'Danger zone' are not routes anywhere in the given 19-route list.
* I: A 'New token' button (line 78) letting the user mint a token from this page — no such action exists; tokens.tsx has no POST/create call, only GET /v1/me/mcp-tokens (load, line 75) and DELETE /v1/me/mcp-tokens/:id (revoke, line 91). Tokens are only created through the separate /mcp/authorize device-approval flow.
* I: A one-time-reveal 'Copy this now — it won't be shown again' panel displaying a raw plaintext token value with a Copy button (lines 80-87) — directly contradicted by the real page's own comment: 'mcp_tokens stores sha256(token); the raw value existed only in the response that minted it' (lines 24-29) and the on-page copy 'The connection itself is never shown — only a one-way hash of it is stored, so there is nothing here to copy or leak' (page.tsx lines 172-177). This is invented functionality that the real implementation explicitly refuses to build for security reasons.
* I: Per-token human-readable client labels ('Claude Desktop — Anjali', 'CI — ticket sync', 'Old laptop') and a masked-token string display (lines 90-99) — the real `TokenRow` type (line 38) is `{ id, createdAt, lastUsedAt }` only; there is no client-name/label field captured or rendered anywhere.
* I: A 'Revoked' historical row state showing past-revoked tokens greyed out with a 'Revoked' pill (lines 100-105) — the real revoke flow deletes the row outright ('Deleting the row ends access', lines 33-35) and reloads the list (line 94), so revoked tokens simply disappear; there is no persisted revoked-but-visible history.
* I: A 'Used 4 min ago' / 'Used 2 hours ago' relative-time column (lines 91, 96) — the real page only ever renders a day-granularity date via `approvedOn()` (lines 52-61, 'Last used {approvedOn(...)}' at line 154), in IST, never a live relative timestamp.
* I: A 'Connect an assistant' box showing a static MCP endpoint URL to paste a token into (lines 108-113) — no such block or copy-paste-token instructions exist in the real page; connecting an assistant instead happens entirely through the separate device-code flow at /mcp/authorize (referenced only as a link at page.tsx line 140).

**C — copy differs. Flag, never silently reword.**

* C: Page title 'MCP tokens' (line 68) vs real 'Connected assistants' (page.tsx line 117).
* C: Prototype subtitle 'Tokens let an assistant read and write tickets as you. They carry your permissions, not more.' (line 69) vs real lead 'Each of these can see and change whatever you can, and every claim it records carries your name...' (page.tsx lines 129-133) — different wording for a similar idea.
* C: Button label 'Revoke' matches (line 100 vs page.tsx line 162) — no conflict here.

**S — styling only. Adopt.**

* Row-based list layout, chip/pill affordances, and the sunken/raised card treatment are adoptable style patterns consistent with the rest of the product's token set.

> This is the prototype with the largest invented-vs-real gap of the four. The persistent app nav bar and settings sidebar do not exist ANYWHERE in the current app (verified against the sole apps/web/app/layout.tsx and every page.tsx's use of the bare .gn-shell class) — restyling this page must not silently introduce global nav/sidebar chrome that the rest of the product lacks, since that is a much larger, unapproved change than restyling one screen. The one-time-reveal raw-token panel and per-client token creation/labeling directly contradict a documented security decision (tokens are hash-only, never re-displayable) and must not be built.

### `Legal` → /privacy

*Mapping: **verified**. The 'Privacy' segmented-control tab is selected by default and the content shown ('What we store', 'Who can see it') matches apps/web/app/privacy/page.tsx's subject matter and section list, confirming this prototype covers /privacy (apps/web/app/privacy/page.tsx).*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: 'Where it is stored' section — India/blr region, object storage, IST clock disclosure (privacy/page.tsx lines 70-78) — entirely absent from the prototype, which only shows 'What we store' and 'Who can see it'.
* D: 'How long we keep it, and the honest complication' section — the append-only-history-vs-right-to-erasure conflict, flagged in a distinct '.gn-legal__flag' callout as an unresolved legal question (privacy/page.tsx lines 80-95) — dropped entirely; this is arguably the single most important section on the real page and has no equivalent in the mock.
* D: 'Who we share it with' — naming hosting/database/object-storage/mail providers and the Google sign-in disclosure (privacy/page.tsx lines 98-110) — dropped (the prototype's 'no third party' callout is narrower and doesn't disclose these named categories).
* D: 'What we send you' section — no notification emails/texts/push, no marketing (privacy/page.tsx lines 112-118) — dropped.
* D: 'Your rights' section — access/correct/export/erase rights, response period, supervisory authority (privacy/page.tsx lines 120-128) — dropped.
* D: 'Changes to this policy' section (privacy/page.tsx lines 130-135) — dropped.
* D: Footer cross-link to /terms (privacy/page.tsx lines 140-143) — replaced by the invented in-page tab switch (see I above) rather than kept as a link.
* D: 'Last updated' + entity/jurisdiction metadata line (privacy/page.tsx lines 31-34, currently bracket placeholders) — prototype shows only a date ('Last updated 8 September 2026', line 65) with no entity or jurisdiction shown.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: A top app bar with logo, 'Gisik Nokma' wordmark, and a 'Sign in' link (lines 47-54) — apps/web/app/privacy/page.tsx renders only `<main className="gn-shell gn-legal">` with no header (line 29), and the root layout (apps/web/app/layout.tsx) supplies no nav chrome anywhere in the app (see McpTokens finding for the same verification).
* I: A client-side segmented-control tab switcher between 'Privacy' and 'Terms' on one page (lines 61-64) — the real product has these as two entirely separate routes/files, /privacy (privacy/page.tsx) and /terms (terms/page.tsx), joined only by a plain text footer link ('See also the Terms & Conditions', privacy/page.tsx line 141-143; and the reverse link in terms/page.tsx line 130-132). There is no tabbed single-page presentation anywhere in the code.
* I: A table-of-contents nav strip — 'What we store / Why / Who can see it / How long / Your choices / Contact' (lines 66-68) — no anchor-linked TOC exists in either real page; the real pages are a flat sequence of <section> blocks with no jump navigation.
* I: Polished, placeholder-free final copy throughout — the prototype states concrete facts as settled ('We do not sell anything, run advertising, or share your workspace contents with any third party.', lines 79-82) — but the real page is explicitly unfinished legal boilerplate: 'BOILERPLATE. NOT REVIEWED BY A LAWYER. NOT LEGAL ADVICE.' with `[ENTITY NAME]`, `[DATE]`, `[JURISDICTION]`, `[CONTACT EMAIL]` placeholders throughout (privacy/page.tsx lines 1-24, 32-41). Shipping the prototype's confident wording as-is would misrepresent the current legal status of the product.

**C — copy differs. Flag, never silently reword.**

* C: Prototype heading 'Privacy notice' (line 63) vs real 'Privacy Policy' (privacy/page.tsx line 30).
* C: Section title 'What we store' (line 70) roughly matches real's combined 'What we collect' (privacy/page.tsx line 46) — close but not identical wording.
* C: 'Who can see it' (line 87) vs real has no section of that exact name — the closest real content is embedded inside 'Who we share it with' (privacy/page.tsx lines 105-109, the per-job visibility paragraph), so this is as much a restructuring as a copy difference.
* C: All of the prototype's specific factual sentences ('Only members of the same workspace...', 'excluded from MCP entirely') are original wording not found verbatim in the real page's current draft — any adoption must go through the same legal-review gate the real page's doc comment requires (privacy/page.tsx lines 1-19), not be silently merged in as a restyle.

**S — styling only. Adopt.**

* Doc-column layout (max 72ch), large-title type treatment, and section spacing are adoptable styling for the legal pages.
* The 'sunken' callout box used for the no-sell/no-ads statement (lines 79-82) is a reasonable styling pattern that could wrap the real page's equivalent 'We do not sell your data...' sentence (privacy/page.tsx lines 88-90).

> Legal.dc.html shows only about 2 of 7 real sections and packages them under an invented tabbed single-page UI with a nav bar that doesn't exist. Restyle work must keep /privacy and /terms as two separate routes, preserve every section (especially the unresolved append-only-history/erasure conflict, which is a legal-risk flag, not filler), and must not launch the prototype's confident final-sounding copy over the deliberately-marked boilerplate without going through the lawyer-review gate the file's own top comment requires.

### `Legal` → /terms

*Mapping: **probable**. The prototype's segmented control includes an unselected 'Terms' tab (line 63) that maps to apps/web/app/terms/page.tsx, but the static mock never renders the Terms tab's content — only the Privacy state is shown in the file. So the mapping to /terms is structural (the tab exists) but has zero content to compare against the real page's sections.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* D: The entire substantive content of /terms has NO prototype representation to check against: 'Agreeing to these terms', 'Your account' (passwordless auth via email/Google/passkey), 'Your content is yours' (no training on user content), 'What you must not do', 'What this product does not promise' (explicitly flagged in the file's own comment as content that 'should survive review largely intact' — no email/SMS/push notifications, unknown Drive-link status, IST-day-for-everyone, and 'parts of it are not built yet'), 'Availability', 'Liability', 'Ending it', and 'Disputes' (terms/page.tsx lines 36-141). None of this can be checked against the prototype because the Terms tab has no rendered content in the .dc.html file.
* D: Footer cross-link back to /privacy (terms/page.tsx lines 129-131) — no equivalent since the Terms panel is unrendered.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* I: The segmented-control tab-switch model itself (see Legal→/privacy row) applies equally here — Terms and Privacy are separate real routes (terms/page.tsx, privacy/page.tsx), not one page with a client-side toggle.
* I: Top nav bar with logo/wordmark/'Sign in' (same as the Privacy state) — apps/web/app/terms/page.tsx line 29 renders only `<main className="gn-shell gn-legal">`, no header.

**C — copy differs. Flag, never silently reword.**

* C: Cannot compare copy — the prototype names a 'Terms' tab (line 63) but supplies no text for it, so no wording claims can be checked one way or the other.

**S — styling only. Adopt.**

* Same doc-column/top-bar/TOC/segmented-control chrome as the Privacy state would presumably apply, per the shared style block — but this is inferred, not shown.

> Flagging this pairing explicitly because the task called for checking both /privacy and /terms: the prototype file only ever renders the Privacy panel's content; the Terms tab is present as a label with no body. Do not treat the Privacy panel's content or structure as a stand-in for /terms — /terms has entirely different, and legally more consequential, sections (limitation of liability, warranty disclaimers, the 'does not promise' list) that have no prototype coverage at all and must be designed/reviewed separately rather than assumed to mirror Privacy's layout.

### `Main` → UNMAPPED

*Mapping: **unmapped**. Content is a design-system/style-guide reference sheet ('Gisik Nokma · Design system', 'Apple HIG foundations', lines 51-53) showing color-token swatches with contrast ratios, the type ramp, button/chip/radius/field specimens, and explicit references to 'Rulings applied' (R1/R2) and the literal path packages/ui/src/tokens.ts (line 54). This is a token/component catalogue, not a product screen. Checked the full verified 19-route list in the task (/, /help, /inbox, /invite/[token], /mcp/authorize, /mcp/tokens, /privacy, /sign-in, /terms, /workspaces, /w/[workspaceId]/{members,my-work,p/[projectId]}, /w/[workspaceId]/settings/{ticket-types,ticket-types/new,ticket-types/[typeId],workflows,workflows/new,workflows/[workflowId]}, plus not-found.tsx) — none of these renders a design-token showcase; grepped apps/web/app for any page referencing 'tokens.ts', 'Apple HIG', or a style-guide route and found none (only design-system/MASTER.md and design-system/tokens.json hold this content outside the prototype itself).*

> UNMAPPED as instructed. Main.dc.html is the design system's own foundations/reference page (a swatch-and-specimen sheet for the token set, citing design-system/tokens.json / packages/ui/src/tokens.ts and 'Rulings R1/R2'), not a mockup of any of the 19 real routes or not-found.tsx. It should be read as documentation of the design language the other three prototypes (and the real app) draw from, not audited for feature parity against a product screen — there is no product screen it corresponds to.

### `Board` → apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx (view==='board' arm, lines 505-539 tab + 605-612 render) rendering packages/app-core/src/views/board.tsx Board

*Mapping: **verified**. page.tsx:126 defines view state 'board'|'list'|'calendar'|'timeline'; :605-612 mounts <Board board={board.data} onOpenTicket={openTicket} /> imported from @gisik-nokma/app-core (board.tsx). This is a TAB of the one project route, not a standalone page.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* 'Only tickets in progress' checkbox + its scope-note (page.tsx:483-503): entirely absent from the prototype though it sits directly above the tab row on every real view.
* AttentionStrip ('What needs your attention', page.tsx:459-463): not represented in the mockup at all.
* 'who · when' provenance-disclosure button on every card (board.tsx:168-175, click to unfold formatStateProvenance): the prototype's static card__prov line is not this control — it's not clickable and doesn't unfold state provenance.
* 'reopened — live work added' cause chip (board.tsx:159-163, shown when card.cause !== null — this is the product's founding reopen-rule feature per MEMORY.md): no equivalent chip appears on any prototype card.
* Zero-groups empty state ('No tickets here yet — create one.' + conditional Create button, board.tsx:70-81): not depicted, though not required since the mock shows a populated board — flagged for completeness since it's real behavior of this exact component.
* ThemeToggle (dark/light) in the real nav (app-nav.tsx:26): absent from the prototype nav entirely.
* 'Workspaces' link, the real nav's actual primary destination (app-nav.tsx:16): missing from the prototype nav, which instead shows 'Board' where that link would be.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* 'Sprint 14' page heading and 'Meghalaya Rollout · Delivery' breadcrumb: no sprint/iteration concept exists anywhere in the domain (grep for 'sprint' across packages/domain, packages/app-core, apps/server hit nothing relevant) and page.tsx renders no project/workspace name heading at all.
* 'Workflow · Delivery v4 · published 2 Sep' caption line: not rendered anywhere in page.tsx or board.tsx; workflow name only appears as a per-group <h3> when a project mixes >1 workflow (board.tsx:86), never as a standalone published-date caption.
* 'Filters' button: no Filters control exists on the Board tab or anywhere in page.tsx (grep for 'Filters' across apps/web and packages/app-core found no matching UI control).
* Per-card 'Contested' chip (pink dot): BoardCard type (packages/app-core/src/view-types.ts:34-44) has no contest field — only assignee, stateProvenance, cause, rollup, pending. Contest data is never surfaced on Board cards.
* '2 blocked' red summary chip in the Blocked column header: board.tsx:98-101 renders only a Chip with the column name and a plain card-count span — no aggregate blocked-count badge.
* 'raised from MCP' ticket provenance line on a card: no such text exists in provenance.ts or anywhere in app-core/apps-web (grep for 'raised from', 'via MCP', 'origin: mcp' found nothing).
* Global nav items 'Board', 'Members', 'Settings', 'Help' as top-level links: AppNav (apps/web/src/app-nav.tsx:15-38) only renders Workspaces, My Work (workspace-scoped), Inbox, a spacer, ThemeToggle, and Sign out — Board/Members/Settings/Help have no nav entry anywhere in the codebase (grep of href= across apps/web/src and apps/web/app).

**C — copy differs. Flag, never silently reword.**

* 'Sign out' link+avatar-initials vs real 'Sign out {user.name}' Button (app-nav.tsx:27-37) — different presentation and wording of the same action.
* Card pending state worded as free text '...claim not yet acknowledged' in card__prov; real renders it as a distinct Chip reading 'claim in transit' (board.tsx:158) — same fact, different words and placement.

**S — styling only. Adopt.**

* Card fills/radii, blocked-column outline ring, segmented-control tab styling, fill-based nav bar (no border) are pure visual reskins of the same DOM shapes (board.tsx:82-124) — adoptable as-is.
* Prototype's per-card colored status chip ('Open'/'Active'/'Blocked'/'Restricted'/'Terminal' with dot) is a visual restyle of information the column already conveys (state = column placement); if kept as a redundant label it is styling, but see INVENTED note below for the 'Contested' variant which is not styling.

> The prototype's nav bar (Board/My work/Inbox/Members/Settings/Help) does not match AppNav's actual link set on ANY of the four prototypes reviewed — this recurs identically in Calendar and Timeline below and is the single largest systemic invented/dropped pattern found.

### `Calendar` → apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx (view==='calendar' arm, lines 541-583) rendering packages/app-core/src/calendar/calendar-view.tsx CalendarView

*Mapping: **verified**. page.tsx:541-583 mounts <CalendarView tickets={dateInputs} today={today} userName={nameOf} onOpenTicket={openTicket} .../> gated on list.rows !== null, list.error !== null → ShellRefusal. Confirms this is the Calendar tab of the same project route as Board, not a separate page.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* 'Today' navigation button (calendar-view.tsx:263-265, moveTo(monthOf(props.today))): the prototype has only Previous/Next-month arrows, no way to jump back to the current month.
* Per-week fold/unfold ('+n more' / 'show fewer', calendar-view.tsx:385-394, MAX_VISIBLE_PER_WEEK=4): every week in the real calendar can overflow and folds after 4 items; the prototype shows unfolded static content for every day and never depicts this control, even though several of its own days (e.g. 8 Sep, 10 Sep) carry multiple events that would trigger it in the real component.
* 'Only tickets in progress' filter control and its scope note (page.tsx:483-503) sits directly above this tab too — absent from the mockup.
* Per-field legend counts and the ability to hide a specific custom date field from the grid (see INVENTED above — this is simultaneously a dropped interactive capability, not just a styling simplification).
* model.emptyCopy: the real component prints one of three distinct sentences when nothing is claimed / everything is legend-hidden / everything is filtered out (calendar-view.tsx:284-288) — not shown since the mock is populated, flagged for completeness.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* 'Sprint 14' heading / 'Meghalaya Rollout · Delivery' breadcrumb — see Board row; no sprint concept in the domain and page.tsx renders no such heading.
* Static 3-item legend ('Due date' / 'In transit' / 'Workspace date field') with no checkboxes: the real legend (calendar-view.tsx:290-308) is a <fieldset> of CHECKBOXES, one row PER CUSTOM DATE FIELD the workspace actually has, each showing the field's own name and a live count, and each toggleable to hide it from the grid — a materially different, data-driven and interactive control the prototype does not depict at all.
* Nav items Board/Members/Settings/Help — same invented-nav finding as the Board row (app-nav.tsx:15-38).

**S — styling only. Adopt.**

* Grid-line-via-gap technique, sunken/raised fills for outside-month days, pill 'today' marker, rounded event pills — visual reskins over the same structural grid (calendar-view.tsx:310-397) and adoptable.
* Legend strip as a raised card vs a bordered strip is pure restyle.

> One thing the prototype gets structurally RIGHT and should be preserved: the 'unplaceable day' state (day 28's '2026-09-31 — not a day' pill) matches a real, deliberately-engineered behavior — calendar-view.tsx:149-176 (weekSpan) and its data-unplaceable rendering exist specifically to show an impossible claimed date as a row-wide 'this week' span rather than silently misplacing it. Good fidelity there; do not simplify it away in restyling.

### `Timeline` → apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx (view==='timeline' arm, lines 587-604) rendering packages/app-core/src/timeline/timeline-view.tsx TimelineView

*Mapping: **verified**. page.tsx:587-604 mounts <TimelineView tickets={dateInputs} today={today} userName={nameOf} onOpenTicket={openTicket} isEpicType=.../> — same tab-of-one-route pattern as Board/Calendar.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* 'Today' button in the header (timeline-view.tsx:218-224, resets anchor to mondayOnOrBefore(props.today)): prototype has only Earlier/Later.
* Per-row custom date claims list (CustomClaimList, timeline-view.tsx:111-126, rendered under a ticket's title when it carries custom date fields): not shown on any bar row in the mockup.
* The side list's per-entry custom claims and its two distinct headings depending on whether entries are purely missing-claim vs. mixed with out-of-window work (model.sideListCopy, timeline-view.tsx:297-301): the prototype's 'Three tickets have no period to draw' panel approximates the concept but omits the dynamic heading logic and the customClaims sub-list.
* 'Only tickets in progress' filter control (page.tsx:483-503) — same omission as the other two view tabs.
* Epic-based grouping itself as a real capability (distinct from the invented state-based grouping above — even restyled correctly, epic grouping headings/behavior must be kept, not replaced by status buckets).

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* 'Sprint 14' heading / breadcrumb — see Board row.
* Row grouping by workflow-state category ('In progress' / 'Blocked' / 'Scheduled'): the REAL component groups rows by EPIC, not by state — `group.epicTitle` is the section heading (timeline-view.tsx:260-262, `model.groups`), derived from `buildTimelineModel`'s epic-ancestor grouping (isEpicType forwarded from the shell, page.tsx:600). A ticket's workflow state is never used as a grouping key anywhere in this component. This is a materially different information architecture, not a styling choice.
* Nav items Board/Members/Settings/Help — same invented-nav finding as the Board row.

**C — copy differs. Flag, never silently reword.**

* 'Docker builder prune — start is after due' side entry: matches a real reason code ('start-after-due', timeline-view.tsx:161-162) but the specific ticket/wording is prototype-invented example data, not to be read as real copy.

**S — styling only. Adopt.**

* Alternating-row fill instead of week-rule borders, pill bars, sunken week-header strip — visual reskin of the same grid structure (timeline-view.tsx:251-287) and adoptable.
* Clipped-bar shapes (bar--clipS/clipE) map directly to real data-clipped-start/data-clipped-end (timeline-view.tsx:273-274).

> The grouping-by-state-vs-grouping-by-epic mismatch is the most significant functional divergence found across all four prototypes — it changes what question the view answers, not just how it looks, and must not be carried into the real restyle without first re-deriving the epic-grouped structure from timeline-model.ts.

### `TicketSheet` → packages/app-core/src/views/ticket-sheet.tsx TicketSheet, mounted from apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:653-660 (opened via ?ticket= query param over any of the four project tabs)

*Mapping: **verified**. page.tsx:644-661: {openTicketId !== null && !expired ? <TicketSheet dataSource=... ticketId={openTicketId} onClose={closeTicket} /> : null} — an overlay reachable from any tab, not a route of its own; confirmed via ticket-sheet.tsx's own Sheet-based right-panel rendering (packages/ui/src/components/sheet.tsx:17-35) which matches the prototype's scrim+right-panel geometry.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* 'Who can see this' VisibilityEditor section (ticket-sheet.tsx:391-403, spec §6 audience control): entirely absent from the prototype.
* Restricted-parent state ('Restricted parent — exists, but you can't see it', ticket-sheet.tsx:334-344): the prototype shows no parent field/breadcrumb-of-parent state at all beyond the top project/sprint line.
* History tab's three-way loading/error/empty distinction and the 'first 200 entries, may go on past them' partial-page notice (HistoryTab, ticket-sheet.tsx:480-509): not represented since the mockup only shows the Details tab, flagged for completeness — the History tab must not be simplified to a bare list when restyled.
* Per-field 'set by X on Y' claim attribution on EVERY field (ticket-sheet.tsx:371-373): the prototype shows some fields with a small claim note (Due, Rollout date) but not uniformly on every field row (Type, Priority, Blocks, Progress lack one) — the real component attributes every field's claim, not a subset.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* A third 'Attachments' tab: the real sheet has exactly two tabs, Details and History (ticket-sheet.tsx:170, 298-315). Attachments are rendered inline INSIDE the Details tab via <AttachmentList entries={attachments ?? []} /> (ticket-sheet.tsx:379), not as a separate tab.
* The whole 'Two devices disagree about this field' contest banner + 'Keep this one / Keep the other / Discard mine' actions: TicketSheet imports no contest component at all. A real ContestBanner exists (packages/app-core/src/contests/contest-banner.tsx, exported from index.ts:265) with a resolve/redo API, but grep across packages/app-core/src and apps/web confirms it is mounted NOWHERE — not in TicketSheet, not in any apps/web route. As currently wired, this functionality does not exist in the product; it must not be treated as 'restyle only'.
* Footer quick-transition buttons ('Move to Blocked', 'Reopen', 'Move to In review') offered as one-click actions: the real sheet has exactly one action, a 'Move…' button (ticket-sheet.tsx:324) that opens TransitionDialog, which computes the *actual* legal transitions from the workflow definition (transition-dialog.tsx:41-58) and can require a comment/evidence per the edge's rules before submitting (ticket-sheet.tsx:256-290, precheck at :228-237). Flattening this into direct-click footer buttons drops the rule-driven comment/evidence prompt and the local precheck/server-refusal surfacing entirely.
* 'Recorded by MCP · 12:04:18' provenance line: no such text or MCP-origin display exists anywhere in provenance.ts or the sheet — grep for 'Recorded by', 'via MCP', 'raised from' found nothing.
* 'GN-1188 · Meghalaya Rollout / Sprint 14' breadcrumb in the header: TicketRead carries no project/sprint context field for the sheet to render, and there is no sprint concept in the domain (see Board row).

**S — styling only. Adopt.**

* Scrim + right-side panel with rounded left corners, close (×) button in a circular fill — matches Sheet's real DOM shape (sheet.tsx:18-30) almost exactly; adoptable as-is.
* Segmented-control tabs vs real role=tablist buttons (ticket-sheet.tsx:298-315) — same structure, restyle only, EXCEPT the tab count (see INVENTED).

> This prototype is the one with the most INVENTED functionality of the four: a phantom Attachments tab, a contest-resolution UI that exists in the codebase but is not wired to this component, and a simplified footer that bypasses the real rule-driven TransitionDialog. None of these three should be built as shown — the contest banner needs a real design decision about whether/how to wire it in, and the transition footer needs to keep going through TransitionDialog's rules engine.

### `TicketTypes` → apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx -> packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx

*Mapping: **verified**. page.tsx imports TicketTypeListScreen from @gisik-nokma/app-core and renders it under AppNav with h1 'Ticket types'; screen source at packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx lines 1-59 confirms the list-of-rows layout the prototype mocks.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* Role gate: 'New type' button and its whole read-only mode. Real screen hides the New-ticket-type button and shows a ReadOnlyBanner ('You can look, not touch…') for non-authors (ticket-type-list-screen.tsx lines 28-40, read-only-banner.tsx). Prototype shows only the full-author state, unconditionally.
* Loading state ('Loading ticket types…', line 27) — prototype has no loading/empty representation.
* Field count singular/plural handling ('1 field' vs 'N fields', line 49) is present in code; prototype only shows plural forms in its fixed sample data (not itself a defect, just unexercised).

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Left settings sidebar nav with sections 'Fields', 'Visibility', 'Danger zone' — grepped apps/web/src and packages/app-core/src for these labels, zero matches. Only two settings sub-routes exist in the real route list (ticket-types, workflows); no settings sidebar component exists anywhere.
* Top nav items 'Board', 'Members', 'Help' rendered as clickable nav links — the real AppNav (apps/web/src/app-nav.tsx) renders only Workspaces / My Work / Inbox / theme toggle / Sign out {name}; Members and Help are real routes but are not linked from nav anywhere found.
* Avatar-initials 'AK' badge next to Sign out — real nav renders plain text 'Sign out {user.name}' via a <Button>, no avatar circle (app-nav.tsx lines 27-33).
* Sample type names Defect/Feature/Field visit/Change request/Incident and 'unpublished draft' status pill on a ticket type — real BUILTIN_TICKET_TYPE_SEEDS (packages/domain/src/ticket-types.ts line 74) are only Epic/Story/Task/Sub-task; there is no per-type draft/published status concept in TicketTypeDef schema (packages/domain/src/ticket-types.ts lines 27-33).

**C — copy differs. Flag, never silently reword.**

* Prototype subtitle 'Six types. Rank orders them in every picker.' vs real screen has no subtitle line at all under the h2 — just the header and the New-type button (lines 32-39).
* Prototype's 'Rank 1..6' label vs real code's lowercase `rank ${type.rank}` (line 47) — case/format differs.
* Prototype badge text 'Built-in' matches real code's literal string (line 46) — no drift here.

**S — styling only. Adopt.**

* Card/grouped-list layout, pill badges, icon tiles, alternating row shading — all CSS-only choices adoptable as-is (ticket-type-list-screen.tsx has no visual styling of its own, only BEM classes).
* Prototype's settings left sidebar ('Ticket types / Workflows / Fields / Visibility / MCP tokens / Danger zone') is a navigational shell choice not present as any component — see INVENTED.

> Theme toggle in prototype's top nav is entirely absent (real ThemeToggle component exists in AppNav but prototype doesn't depict it) — flag as dropped-from-prototype, not a product gap.

### `TicketTypeEditor` → apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx and .../ticket-types/new/page.tsx -> packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx

*Mapping: **verified**. Both edit and new routes render TicketTypeEditorScreen; source at ticket-type-editor-screen.tsx (392 lines) implements name/icon/rank/workflow/fields editing plus a workflow-divergence/migration flow that the prototype's right-column 'Changing the workflow moves 23 tickets' card mocks.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* Role gate / read-only mode: every input in the real editor is `disabled={!canAuthor}` and a ReadOnlyBanner renders for non-authors (ticket-type-editor-screen.tsx lines 209-259). Prototype shows only the full-author editable state.
* Per-field 'Remove field' button and the 'Add field' + remove-row flow (fields-editor.tsx lines 64-72) — prototype's field rows have no delete affordance.
* 11 of 16 selectable icons (TYPE_ICON_NAMES) not shown in the prototype's 5-icon strip.
* Save-flow states: 'saving', 'refused' (server rule + reason, lines 376-382), 'invalid' (schema message, lines 383-388), and the 'Ticket type saved.' confirmation (line 373-375) — prototype shows only a static 'Save type' button, no outcome states.
* Schema validation issues list (`ticket-type-editor__issues`, lines 353-359) rendered inline when the def fails validation — no equivalent in prototype.
* Rank field is disabled for built-in types with an explanatory note ('Built-in type — its place in the hierarchy is fixed.', lines 231-240) — prototype's Field visit (a non-builtin) doesn't exercise this, so it's simply unshown, not contradicted.
* The full migration flow: pinned target via 'bindingCommitted' gating (must Save before Move is enabled, lines 304-327), the WorkflowRebindDialog state-mapping UI (workflow-rebind-dialog.tsx), 'refused' migration outcome, and the post-migration 'N tickets moved to X' terminal message (lines 262-273) — prototype shows only the pre-decision static card with two buttons, none of the surrounding states.
* Ticket-count-unavailable degradation ('ticket count unavailable' when the read fails, divergenceCountLine/divergenceBody lines 52-75) — prototype always shows a clean number (23 of 41).

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Per-field 'Required' pill on Site name / Visit date — customFieldDefSchema (packages/domain/src/ticket-types.ts lines 10-24) has no `required` field, and fields-editor.tsx has no Required checkbox anywhere. Fully fabricated.
* Per-field 'Restricted' pill on Contact phone, plus the Implications bullet 'The restricted field stays hidden from guests in every client' — no restriction/visibility flag exists on CustomFieldDef; grep for 'restricted' in the ticket-types schema/editor returns nothing relevant to fields.
* 'Attachment' field type — real FIELD_TYPES is exactly ['text','number','date','select','person'] (fields-editor.tsx line 3); Attachment does not exist.
* Implications card bullets ('Two pickers will re-order: the board's New ticket menu and MCP's create_ticket', 'Published workflows are versioned') — the real 'Implications' text (rank.ts rankImplicationsCopy, lines 33-38) is entirely about parent/child rank hierarchy ('Must sit under a parent…Can sit under: X, Y'), a different feature with the same card name. The prototype's implications content does not exist anywhere in the codebase.
* Only 5 icon choices shown in the picker — real IconPicker renders all 16 names from TYPE_ICON_NAMES (icon-picker.tsx, icons.tsx); prototype under-represents but does not invent here (see Dropped).

**C — copy differs. Flag, never silently reword.**

* Prototype: 'Changing the workflow moves 23 tickets' / '23 of 41 Field visit tickets sit in a state Field ops v2 does not have.' vs real: 'Existing tickets stay where they are' heading plus body like '23 existing tickets of this type stay on "X". New ones will use "Y".' (lines 65-75, 276) — meaningfully different framing (prototype implies an active move; real copy states tickets stay put by default).
* Prototype buttons 'Move them to Scheduled' / 'Leave them' vs real button text `Move them to "${incomingWorkflow.name}"…` / `Leave them on "${outgoingWorkflow.name}"` (lines 311, 320) — real copy always names the destination workflow explicitly and adds an ellipsis to Move.
* Prototype closing line 'Neither choice is recommended over the other — leaving them is a decision, not a deferral.' has no counterpart string in the real component — appears to be invented supporting copy.

**S — styling only. Adopt.**

* Card layout, field row styling, icon-picker grid presentation, pill styling for field-type labels — CSS-only, adoptable.
* Divergence notice as a warning-tinted card is a reasonable restyle of the real `<section class="ticket-type-editor__divergence">` block (lines 260-347).

> This is the most functionality-dense of the four prototypes; several real safety mechanisms (binding-committed gate, honest degradation on failed counts, migrated-state retirement of the divergence copy) are collapsed in the prototype into one static always-available card — must not be built as shown.

### `Workflows` → apps/web/app/w/[workspaceId]/settings/workflows/page.tsx -> packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx

*Mapping: **verified**. workflows/page.tsx renders WorkflowListScreen from @gisik-nokma/app-core; source at workflow-list-screen.tsx (70 lines) is a plain name/version/state-count/Open row list, far simpler than the prototype's card grid.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* Role gate / read-only banner for non-authors (workflow-list-screen.tsx lines 41-47) — prototype shows only the always-editable New-workflow-button state.
* Empty state 'No workflows published yet.' (line 49) — not depicted.
* Load-failure state 'Could not load workflows — reload to try again.' (lines 32-34) — not depicted.
* Loading state 'Loading workflows…' (line 35) — not depicted.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Draft/Published/Superseded status pills, e.g. 'Published', 'Draft · 2 issues' — PublishedWorkflowDef (packages/domain/src/workflow.ts line 74, = WorkflowDefinedPayload) carries no status field; grepped gateway.ts and workflow-list-screen.tsx for 'duplicate|discard|history|usedBy' — zero matches, confirming no draft/published/superseded lifecycle is tracked or exposed here at all.
* Mini state-flow preview (state chips with category-colored caps and arrows) on the list — no such rendering exists in workflow-list-screen.tsx; only `${workflow.states.length} states` text is shown (line 56).
* 'N transitions', 'used by N ticket types', 'N tickets' summary line under each card — none of these are computed or passed by workflow-list-screen.tsx.
* 'Duplicate' button — no duplicate action exists in WorkflowAuthoringGateway (gateway.ts, grepped) or anywhere in app-core.
* 'Discard draft' button — no draft-discard concept exists (workflows here are either published-and-in-list or being authored in the builder; there is no persisted 'draft' row).
* 'View history' button and the 'Field ops v1 … Superseded … kept because 128 recorded events cite it' card — no version-history listing UI exists; the gateway has no history-fetching method.
* 'New workflow' going straight to an authoring canvas — actually the real 'New workflow' flow first shows a TemplateGallery picker (apps/web/app/.../workflows/new/page.tsx lines confirmed) before any canvas; prototype's list screen doesn't show this intermediate step (not a defect of the list screen itself, just worth noting for scope).

**C — copy differs. Flag, never silently reword.**

* Prototype subtitle 'Publishing records a version. Nothing already recorded is rewritten.' has no counterpart in workflow-list-screen.tsx, which renders no subtitle at all.
* Real 'Open <workflow name>' aria-label (line 59) vs prototype's plain 'Open' button text — minor but real copy is per-item accessible-labeled, prototype's is generic.

**S — styling only. Adopt.**

* Card-grid layout, mini state-flow chip previews at the visual level, pill styling — none of this exists as functionality to restyle except the base name/version/state-count/Open row (adoptable at the row level only).

> The real Workflows list is dramatically thinner than the prototype: name, version, state count, Open — that's it. Every other affordance in the prototype (status, duplicate, discard, history, mini previews, usage counts) is invented and must not be built without separate product/spec approval.

### `WorkflowBuilder` → apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx (and .../workflows/new/page.tsx after template pick) -> packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx (+ workflow-canvas.tsx, state-node.tsx, state-inspector.tsx, transition-inspector.tsx, issues-panel.tsx, system-rules-panel.tsx, publish-controls.tsx)

*Mapping: **verified**. [workflowId]/page.tsx loads the published def and renders WorkflowBuilderScreen; workflow-builder-screen.tsx (129 lines) composes header (name field, Add state, PublishControls) + 3-column layout: left aside (SystemRulesPanel + IssuesPanel), center canvas (WorkflowCanvas/@xyflow react-flow), right InspectorPanel. This matches the prototype's canvas+node+inspector concept closely enough to confirm the mapping, though the layout and feature set diverge substantially in detail below.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* SystemRulesPanel — an entire left-column aside stating the two non-authorable system invariants ('Provenance on everything…', 'Parents cannot outrun children…', system-rules-panel.tsx lines 15-29) is completely absent from the prototype; the prototype's layout has no left column at all (grid-template-columns: 1fr 340px — canvas + right inspector only).
* Transition rule authoring: the five rule kinds (restrict-to, require-comment, require-evidence, require-field, require-different-user — packages/domain/src/workflow.ts lines 17-31) with per-rule summaries, Remove rule, AddRuleMenu, and full RuleEditor UI (transition-inspector.tsx lines 1-45) — the prototype's edge labels ('Start visit', 'Submit report', 'Cancel', 'Sign off') are static text with zero rule-editing affordance; clicking a transition in the real app opens a rich rule editor, not shown at all.
* Advisories section footer 'Advisories never block publishing.' exists (issues-panel.tsx line 96-98) but is present in the prototype too — no gap there. However the real Issues panel is in the LEFT column beside SystemRulesPanel, not the right column as in the prototype — a location/composition difference worth flagging alongside the SystemRulesPanel drop.
* Role gate / read-only mode: env.canAuthor gates the name field, Add state button (hidden entirely, lines 37-50), node category/blocked controls, node connectability, and PublishControls renders null for non-authors (line 59) with a ReadOnlyBanner shown instead (line 108) — prototype shows only the full-author editable state.
* Publish flow states beyond the static button: 'submitting', 'mapping' (StateMappingDialog for dropped states with occupancy count / occupancyFailed honest-degradation, publish-controls.tsx lines 89-104, 117-128), 'published' success banner ('Version N published.'), 'refused' banner with server rule+reason, 'invalid' banner — none of these are depicted; prototype shows only the pre-publish blocked state.
* Loading state ('Loading workspace people and types…') and load-failure state ('Could not load workspace people and types — reload to try again.') — not depicted (workflow-builder-screen.tsx lines 84-93).
* The 'New workflow' entry path via TemplateGallery (apps/web/app/.../workflows/new/page.tsx) that precedes this canvas when creating fresh — this prototype only depicts editing an existing draft, so the template-picker state of the same builder surface isn't represented at all.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Right-inspector 'On site' card showing Category dropdown + 'Blocks the ticket' toggle + 'Initial state' toggle switch as one unified panel — real category picker AND the 'Blocked' checkbox live on the STATE NODE ITSELF on the canvas (state-node.tsx lines 28-56), not in the right inspector; the right inspector (state-inspector.tsx) instead shows only a State-name input and two buttons: 'Set as start' and 'Delete state' (lines 9-38). The prototype invents a consolidated card that doesn't reflect where these controls actually live, and further invents that 'initial state' is a toggle switch — it is actually a button, disabled when already the initial state (line 26).
* 'Draft · last saved 11:58' timestamp in the header — no last-saved timestamp state exists anywhere in workflow-builder-screen.tsx or publish-controls.tsx.
* 'Cancel' button in the header next to Publish — no cancel button exists in the real header (workflow-builder-screen.tsx lines 104-112 render only ReadOnlyBanner?, WorkflowNameField, AddStateButton, PublishControls).

**C — copy differs. Flag, never silently reword.**

* Prototype issues heading '2 issues · blocks publishing' / advisory heading '1 advisory' vs real headings 'Issues' (issues-panel.tsx line 64) and 'Worth a look — none of these block publishing' (line 82) / all-clear text 'No issues — this workflow can be published.' (line 60) — materially different wording and the real UI has no numeric '2 issues' count header style.
* Prototype's issue text 'Awaiting sign-off is blocked and has no outgoing transition.' / 'No transition reaches Complete from Scheduled.' are plausible but not verified against the actual validateWorkflowDef message strings (not read in this audit — flag as unverified copy, do not assume exact wording matches).
* Prototype advisory text '"On site" has no assignee rule — tickets can sit unowned.' not verified against adviseWorkflowDef's actual message strings — same caveat.

**S — styling only. Adopt.**

* Node card look (filled left-edge category cap, rounded corners, shadow) is a reasonable restyle of state-node.tsx's BEM classes (gn-state-node--open/active/terminal).
* Canvas edge/label rendering is delegated to @xyflow/react at runtime, not hand-drawn SVG; prototype's static SVG paths are a mockup approximation, fine as illustrative styling only.

> Largest functional gap of the four: an entire left-hand invariants panel and the whole rule-authoring subsystem (5 rule kinds, add/remove/edit) are missing from the prototype, while the right inspector is restructured into a shape (unified card with toggles) the real component tree does not have. Both must be treated as requirements to preserve, not redesign away.

### `MyWork` → apps/web/app/w/[workspaceId]/my-work/page.tsx

*Mapping: **verified**. page.tsx renders <AppNav workspaceId/>, <h1>My Work</h1>, <AttentionStrip> and <MyWork view=.../> from packages/app-core/src/views/{attention-strip,my-work}.tsx — same nav-item name and content shape as the prototype. Route is workspace-scoped (/w/[workspaceId]/my-work), not global; apps/mobile/src/screens has no my-work screen (grep for MyWork/useMyWork in apps/mobile/src returns nothing), so this prototype maps to exactly one route, web only.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* Two of MyWork's four real sections are entirely absent from the mockup: 'My claims in transit' (with the pending 'claim in transit' Chip) and 'Shared with me' (which my-work.tsx's own comment says must render unconditionally, even empty, precisely so a guest with only shared errands sees a real screen rather than a section that silently disappears).
* Named empty-state sentences for every section ('Nothing assigned to you.', 'No claims in transit.', 'No contested claims.', 'Nothing has been shared with you.') — dropped; the mockup shows only populated example rows.
* State provenance on the chip: Chip tone={item.stateCategory} title={formatStateProvenance(...)} — the hover-revealed provenance text is dropped.
* projectName-withheld fallback: when item.projectName === null, WorkItemCard renders item.projectId with a title tooltip ('You have not been told this project's name.') instead of blank — this conditional and its accessibility affordance are dropped.
* ContestedCard's full structure: a Chip showing contested.rule (the refusing rule's name), the verbatim contested.reason from the rule engine, and renderContestedClaimAttribution(contested.claim) — the prototype's single 'Contested' chip with a generic sentence drops the rule name and the attributed claim line.
* ThemeToggle control (light/dark) present in every real nav — absent from the mockup's nav entirely.
* 'Workspaces' nav link — present in real AppNav, absent from the mockup nav (which instead invents Board/Members/Settings/Help).

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Cross-workspace aggregation ('Eleven tickets assigned to you across three workspaces.') — my-work.tsx's useMyWork(source, workspaceId) and the route itself (/w/[workspaceId]/my-work) are single-workspace; there is no cross-workspace My Work anywhere in apps/web or apps/mobile.
* Grouping by due date into 'Due this week' / 'Later' sections — real MyWork (packages/app-core/src/views/my-work.tsx) groups by CLAIM STATUS into exactly four fixed sections: 'Assigned to me', 'My claims in transit', 'My contested claims', 'Shared with me' (see the component's own docblock explaining this axis choice is deliberate, not the server's {open,active,terminal} state-category split either). No due-date bucket exists.
* Attention item labelled 'In transit' with an orange dot/chip, describing an unacknowledged claim — attention-strip.tsx's AttentionKind union is only 'blocked' | 'stale' | 'due-soon' | 'contested', with labels Blocked/Stale/Due soon/Contested. There is no 'In transit' attention kind; that concept ('claim in transit') exists only inside MyWork's separate pending chip, not the attention strip.
* 'Overdue by 2 days' / 'No date claimed' due-date phrasing rendered unconditionally — WorkItemCard (my-work.tsx) renders the due line only when item.dueDate !== null, and when present it always reads 'needed by {date} — {actor}'s claim' (attributed to whoever claimed it); it never renders an 'Overdue by N days' countdown or a 'No date claimed' placeholder string.
* Full signed-in chrome in nav: 'Board', 'Members', 'Settings', 'Help' links plus a circular avatar badge ('AK') — apps/web/src/app-nav.tsx renders only Workspaces, My Work (conditional), Inbox (with unread badge via InboxNavLink), a spacer, ThemeToggle, and a text 'Sign out {user.name}' button. There is no Board/Members/Settings/Help nav link and no avatar element anywhere in AppNav.
* Bottom 'Live · Last acknowledged 12:04:18 · 0 claims queued' sync strip — packages/app-core/src/sync/sync-status-bar.tsx exports a SyncStatusBar component, but grep across apps/web/app and apps/web/src shows it is imported nowhere; the real /my-work page never renders it, so this strip does not appear on the actual page today.

**C — copy differs. Flag, never silently reword.**

* 'My work' (prototype h1, lowercase 'work') vs real <h1 className="gn-page-title">My Work</h1> — capitalization differs.
* Prototype subtitle 'Eleven tickets assigned to you across three workspaces.' has no counterpart in the real page at all (no subtitle line under the h1) and describes cross-workspace scope that does not exist.
* Section labels 'Due this week' / 'Later' vs real 'Assigned to me' / 'My claims in transit' / 'My contested claims' / 'Shared with me' — different vocabulary entirely, not a restyle of the same labels.

**S — styling only. Adopt.**

* Attention band: real CSS likely differs, but structurally the prototype's tinted-fill '.attention' band with a warning triangle matches AttentionStrip's <aside className="gn-attention">; colour/fill treatment is S.
* Card grouping into two equal-width columns ('Due this week' / 'Later') is a pure layout choice over real data — see D/I below for why the grouping key itself is invented, but the visual card/list styling (radius, muted labels, chips) is adoptable S.
* Chip pill styling (dot + label) generally matches Chip component's role-based rendering (packages/ui) — colour tokens differ (mockup uses raw hex vs var(--gn-*) roles) — S.

> The prototype reflects an earlier/aspirational due-date-driven design rather than the shipped claim-status model; every functional grouping decision in it is invented. Treat the D column here as the load-bearing finding: two whole sections (in-transit, shared) and their reasons for existing (see my-work.tsx docblock) must not be lost if this mockup is used as a restyle target.

### `Inbox` → apps/web/app/inbox/page.tsx

*Mapping: **verified**. page.tsx renders <AppNav/> (no workspaceId — /inbox is deliberately a GLOBAL route per its own docblock), <h1>Inbox</h1>, and <InboxView> from packages/app-core/src/inbox/inbox-view.tsx — matching the prototype's nav-item name, list-of-rows shape, unread dot, and 'Load more' button. apps/mobile/src has no Inbox screen (grep for 'Inbox' in apps/mobile/src returns nothing), so this maps to exactly one route.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* Four distinct page-level states are collapsed to none in the mockup: refused (<ShellRefusal what="Your inbox">), loading ('Loading…'), expired-session (<ExpiredSessionNotice/>), and the exported EMPTY_INBOX_COPY sentence for a genuinely empty inbox ('Nothing in your inbox. You will be told here when someone assigns you a ticket, mentions you, contests a claim, or a claimed day comes near.').
* CANNOT_OPEN_COPY refusal ('That ticket cannot be opened from here — it may have been removed, or it is no longer visible to you. The message itself is yours and stays.') shown when opening a notification's ticket 404s — dropped.
* PAGING_FAILURE_PREFIX behavior: a failed second page keeps the already-loaded rows on screen and shows the failure text beside the Load-more control rather than replacing the list — this deliberate distinction (see inbox/page.tsx docblock on why a paging failure must NOT route through the same `error` state) is entirely absent from the static mockup.
* Row click behavior: each row is a <button> that marks itself read AND navigates to the ticket (onClick calls onMarkRead then onOpen) — the mockup's rows are non-interactive display-only divs with no equivalent affordance shown.
* Deep-link resolution via ticketLocation.locate(workspaceId, ticketId) before navigating (async, can fail) — not represented; the mockup implies a simple static link.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Segmented filter control 'All / Unread / Mentions' — InboxPage and InboxView have no filtering state, no tabs, and no per-kind filter of any sort; every fetched notification is rendered (see inbox-view.tsx's docblock: 'no visibleTicketIds prop, no per-row predicate, no filter anywhere in the map' — deliberately, per the standing ruling that a delivered message is the reader's own).
* 'Mark all read' bulk-action button — gateway.markRead(id) in inbox/page.tsx only marks one notification at a time (markRead(id): void), invoked per-row on click; there is no bulk/mark-all endpoint or button anywhere in InboxPage or InboxView.
* Static '3 results' hardcoded framing text 'Seven unread of 42.' — not applicable here (that's the Help prototype); for Inbox the subtitle 'Seven unread of 42.' itself is invented — no unread/total count summary line exists in the real page.
* Full signed-in chrome in nav (Board/Members/Settings/Help links, avatar badge) — same finding as MyWork: apps/web/src/app-nav.tsx has none of these; ThemeToggle and Workspaces link are dropped instead.

**C — copy differs. Flag, never silently reword.**

* 'Inbox' + 'Seven unread of 42.' — no real counterpart string; real page has just the h1 'Inbox' with no summary subtitle.
* 'Load 20 more' — real button text is exactly 'Load more' (inbox-view.tsx:114-116), no count is ever shown on the control.
* Row copy ('Anjali mentioned you on GN-1188', etc.) is invented example content standing in for notificationHeadline()/notificationBody() output — not evaluated for real wording since it's illustrative, but flagged since a real notification's headline/body come from packages/app-core/src/inbox/format.ts, not authored per-row text.

**S — styling only. Adopt.**

* Row layout (icon glyph, headline, secondary body text, trailing timestamp) generally matches InboxView's <button className="gn-inbox__row"> structure — colour/spacing/alternating-row-fill treatment is S.
* Unread indicator (bold headline + accent-coloured glyph + trailing dot) matches data-unread='true' styling hooks in inbox-view.tsx — S.
* 'Load more' button text and placement match onLoadMore-driven <button className="gn-inbox__more">Load more</button> — S (mockup renames it 'Load 20 more', see Copy).

> Inbox's real complexity is almost entirely in its state machine (5 named states plus a paging-failure sub-state) and its 'never filters what was delivered to you' guarantee — both are the most important things not to lose if this mockup drives a restyle.

### `Help` → apps/web/app/help/page.tsx

*Mapping: **verified**. page.tsx renders <HelpBrowser/> from packages/app-core/src/help/help-browser.tsx directly inside <main className="gn-shell">, with NO <AppNav/> at all — page.tsx's own docblock states 'No session is required to reach it' and HelpBrowser's docblock states desktop (apps/desktop) shares the exact same component while apps/mobile/src/screens/help-screen.tsx is a separate, mobile-specific renderer over the same parsed content (HELP_CONTENT). So this prototype maps to TWO real surfaces: apps/web/app/help/page.tsx (verified, this row) and, structurally, apps/mobile/src/screens/help-screen.tsx (a distinct native implementation, not covered by this HTML mockup's DOM but sourced from the same content.generated.ts).*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* The no-match empty state: 'Nothing in the manual or FAQ matches "{query}". All {n} entries were searched, so this is a real absence rather than a search that did not run — the product may simply not do that thing yet. The list below is everything there is.' — this deliberate wording (distinguishing 'not searched yet' from 'searched, found nothing') is dropped.
* Live-as-you-type search: value={query} onChange={...} with no submit button/action — the real search box updates results on every keystroke with no explicit search step; the mockup shows a static populated query with no indication of this behavior.
* placeholder text 'due date, passkey, offline…' — dropped (mockup shows a filled-in query instead, so the placeholder's example content is lost).
* Rich content rendering support that HelpBrowser handles but the mockup's static content doesn't exercise: ordered lists (<ol>, semantically numbered instructions) vs unordered, and full <table> rendering with a horizontal-scroll wrapper (gn-help__table-scroll) — not represented at all in the mockup body.
* Internal (non-http) links rendered as plain text rather than dead anchors (Span's link case: only /^https?:\/\//-matching hrefs become <a> tags) — a deliberate anti-dead-link rule, not shown or contradicted, but worth preserving if the mockup's <a href="#"> placeholders get taken literally.

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* Static, fixed count '3 results' text with no query-echo wording — real Results component always renders '{n} answers for "{query}"' (help-browser.tsx:151-156), i.e. the word is 'answers', not 'results', and it always names the query.
* The 11-item fixed TOC ('Getting started', 'Workspaces', 'Tickets', 'Boards and views', 'Workflows', 'Ticket types', 'Working offline', 'Dates and claims', 'Visibility', 'MCP', 'Keyboard') is invented wholesale — the real TOC is data-driven from the active document's sections, whose actual top-level titles are things like '§1 — Signing in', '§2 — Finding your way around', '§3 — Workspaces, and the project problem', '§4 — Getting your people in' (content.generated.ts, generated from docs/manual.md) — a completely different naming scheme (numbered §-sections written in prose, not short nav-style nouns).
* Full signed-in nav chrome (Board/My work/Inbox/Members/Settings/Help links + avatar 'AK' + 'Sign out') is entirely invented for this route: apps/web/app/help/page.tsx renders no <AppNav/> at all, and the page's own docblock states it needs no session — there is no sign-out control, no avatar, and no nav bar of any kind on the real /help page.

**C — copy differs. Flag, never silently reword.**

* Segmented control 'Manual' / 'FAQ' vs real tab labels, which are the FULL document titles: 'Gisik Nokma — instruction manual' and 'Gisik Nokma — frequently asked questions' (content.generated.ts:14, :5508) — the mockup's short labels are not what ships.
* '3 results' vs real '{n} answers for "{query}"' — different noun ('results' vs 'answers') and the real string always names the query.
* Section heading 'Working offline' and body text in the mockup ('Gisik Nokma keeps working when the network does not...') is illustrative prose that does not match any exact string found in the generated manual content (not verified against docs/manual.md's real 'working offline' section verbatim) — flag as unverified copy, needs a direct diff against docs/manual.md if adopted.

**S — styling only. Adopt.**

* Search field with icon, min-height 44px, 17px text is styled consistent with the real <input id="gn-help-search" type="search">'s accessibility intent (help-browser.tsx:184-194) — S.
* Segmented control for switching documents ('Manual'/'FAQ' styling) matches the real <nav className="gn-help__tabs"> rendering one button per HELP_CONTENT doc with aria-pressed — S (labels themselves are wrong, see Copy).
* 'TOC' as a flex-wrapped row of links matches <nav className="gn-help__toc"> which lists active.sections as anchor links — S in layout; content differs, see Copy/Invented.
* Quote block and inline code styling (.quote, .code classes) map to real 'quote' and 'code'-kind block/span renderers in help-browser.tsx — S.

> Two real surfaces exist for this content (web+desktop share help-browser.tsx; mobile has its own help-screen.tsx) — this mockup's DOM only corresponds to the web/desktop shared component. Confirmed apps/mobile/src/screens/ contains board-screen.tsx, help-screen.tsx, ticket-screen.tsx and nothing named my-work or inbox, so Help is the one prototype in this batch with a genuine second (structurally distinct) real target.

### `NotFound` → apps/web/app/not-found.tsx

*Mapping: **verified**. not-found.tsx is the Next.js not-found handler (default export NotFound()), rendering <main className="gn-shell gn-notfound">, an h1, and a <ul className="gn-notfound__causes"> of three explained reasons, plus two <Link> actions — same page-shape (icon, title, body, action links) as the prototype, and both agree there is no nav bar on this page.*

**D — EXISTS AND THE PROTOTYPE OMITS IT. Keep and restyle; never delete.**

* The three-cause breakdown as a real, load-bearing structure: 'The address is mistyped, or the link was broken.', 'The page moved.', and 'The thing exists and is not yours to see.' — each with its own explanatory clause — collapsed by the mockup into one generic sentence. This is the single biggest content loss: the third cause encodes a genuine SECURITY PROPERTY (the page's docblock explains the API returns identical 404s for 'doesn't exist' and 'not yours', by design, to prevent enumeration) and the mockup's blended phrasing quietly discards that distinction.
* The entire 'Why it will not say' paragraph explaining the deliberate non-disclosure design (comparing it to the '5 of 8 done · 2 restricted' pattern elsewhere in the product) — dropped.
* The closing aside: 'If you believe you should be able to see this and cannot, the person who administers your workspace can check — visibility is set per job, and they can see who a job is shared with.' — dropped; the mockup's closing line ('If someone sent you this link, they may still have access — ask them to re-share it from the ticket.') is different advice entirely (re-share vs ask an admin to check).

**I — SHOWN BUT DOES NOT EXIST. Do not build.**

* A third action link, 'Search the manual', pointing at Help — not-found.tsx renders exactly two <Link> actions: 'Go to your workspaces' (/workspaces) and 'Open your inbox' (/inbox). There is no link to /help on the real 404 page.
* Single generic explanatory sentence ('The link may be out of date, or the ticket may have moved to a workspace you don't belong to. Nothing was deleted.') as if that's the whole explanation — the real page deliberately gives three distinct, individually-explained causes rather than one blended guess (see Dropped).

**C — copy differs. Flag, never silently reword.**

* Title: 'This page isn't here' (prototype) vs 'This address does not match a page.' (real, not-found.tsx) — materially different register and claim (the real title deliberately avoids asserting the page 'isn't here' since the ambiguous-404 design means it might exist).
* Body: prototype's single paragraph vs real's structured 'That is all this page can tell you for certain. There are three reasons you might be here, and Gisik Nokma can rule out only the first two.' plus the itemized list — not a simple reword, a different information architecture.
* Terminology: real copy uses 'job' ('the job exists and is not yours to see', 'visibility is set per job') where the prototype uses 'ticket' ('the ticket may have moved') — inconsistent noun choice worth flagging if 'ticket' is the term used elsewhere in the product (e.g. My Work, Inbox) while this page alone says 'job'.
* Action link labels 'Go to your workspaces' and 'Open your inbox' match verbatim between prototype and real page — no diff on those two.

**S — styling only. Adopt.**

* Centered single-column layout with an icon glyph in a rounded tile above the title is consistent with the prototype's centered '.sheet' composition — S.
* Standalone-control sizing (44px min-height pill-style links) for the action links is consistent with the real <Link className="gn-notfound__link">-driven controls, assuming that class resolves to similar sizing — S.

> This is the cleanest 1:1 route mapping in the batch (no nav ambiguity, no cross-app duplication), but also the prototype with the most severe content loss relative to its size: the real page's entire reason for existing — refusing to distinguish 'doesn't exist' from 'not yours' as a security property — is invisible in the mockup.

