# Access and invite follow-ups — design

**Status:** spec for owner review. Written 2026-09-29 (evening) by the planner, from the production follow-ups of the access release (#761) and the owner's rulings the same evening.
**Base:** `origin/main` at `bd7440bc` (= `release/2026-09-29` at cut). Citations are a read-only research pass over that tree; the plan re-reads each before building on it.
**Target branch:** `release/2026-09-29`.
**Precedes:** `2026-09-29-workspace-access-and-invites-design.md` (shipped). This spec amends two of its decisions (W3's single-ticket view, extended to inherited items, and the bearer-authorised invite link) on the owner's word.

## 1. The owner's rulings (2026-09-29 evening), verbatim where quoted

| # | Item | Ruling |
|---|---|---|
| R1 | Assigning someone to an explicit-list ticket | *"keep today's behaviour and just extend it to cover those notes and sub-tickets"* (re-confirmed; supersedes "always added to the explicit-list") |
| R2 | Email lookup reveals the person's role; guests can use it | as recommended: drop the role, refuse guests |
| R3 | Users with a blank name, and guests, show raw ids | *"show email."* |
| R4 | An invite link accepted by an account it was not addressed to | *"refuse"* |
| R5 | No way to remove a member from a workspace | as recommended: spec an owner/admin "Remove from workspace", history kept |
| R6 | Invite send takes ~18 s with no progress (double-send risk) | *"as recommended. also look into why it actually takes 18s."* — progress + disabled button, and find the cause |
| R7 | A new note flashes "no longer shared" for ~1 s | as recommended: fix |

Two small findings from the 2026-09-29 production cleanup ride along (§9).

## 2. R1 — the assignee's access extends to what inherits the ticket

**Owner ruling, 2026-09-29 (re-confirmed after the planner corrected the premise):** *"keep today's behaviour and just extend it to cover those notes and sub-tickets."* This supersedes the earlier reading ("always added to the explicit-list"), which the planner had put to the owner on a misstated premise.

**Today.** No path adds an assignee to a ticket's explicit list, by design: *"The explicit list is exactly the authored list. Creator and assignee are not implicitly appended"* (`apps/server/src/visibility/can-see.ts:58-60`). A read-time **assignee arm** lets the CURRENT assignee see the ticket (`can-see.ts:193-206`, checked after the audience at `:288-297`); it reads live `proj_tickets.assignee_id`, so unassigning removes access at once. The arm does **not** reach what inherits the ticket's audience: notes that inherit from the ticket (`read/visible-where.ts:310`), sub-tickets that inherit its list, and the rollup's restricted count (`visibility/rollup.ts:308-318`) — those three citations come from the research pass's report and were not opened by the planner; the plan opens them first.

**Decision.**
- A1. **The list is untouched.** Assigning never writes a visibility change; the explicit list stays exactly the authored list (`can-see.ts:58-60` holds).
- A2. **The arm is extended by inheritance.** While someone is the current assignee of ticket T, they may also see every item whose audience is INHERITED from T: notes attached to T that inherit its audience, and sub-tickets of T that inherit its list (recursively, as far as the inheritance chain runs). An item with its OWN audience (an explicit list of its own, or a narrower scope) is judged by that audience alone, never by T's arm.
- A3. **It ends when the assignment ends.** Unassign or reassign T and the extended access disappears with the arm — the same live read, no stored grant.
- A4. **Not extended:** T's parent, T's project, sibling tickets, and notes merely mentioning T. A sub-ticket's OWN assignee arm stays its own.
- A5. **Every reader agrees.** The single-item check (`canSee`), the list/search reads (`visible-where`), sync's visible-event filter and the rollup counts must all apply the same extension, or an item shows in one place and 404s in another. The plan names each reader and gives each a case.
- A6. No authority check changes (access finding 10 closes as: assigning keeps its current reach, now including inherited items).
- A7. The shipped spec's W3 is amended to say the assignee's single-ticket view extends to items that inherit that ticket's audience.

## 3. R2 — email lookup: no role, no guests

**Today.** `POST /v1/workspaces/:id/people-lookup` (`routes/people.ts:112-132`, `lookupPerson` `:46-67`) returns `role` and `inWorkspace` (`:24-30`, `:64-65`); the only gate is `requireMember` (`:127`), which admits guests (`read/membership.ts:60-67`).

**Decision.** Drop `role` from the response. Refuse a guest caller (the same refusal shape as other member-only reads). Keep `inWorkspace` — the pickers need it to choose between "assign" and "assign and add as guest". Callers: the invite form (`members/page.tsx:786-798`) and the assignee pickers (`apps/web/src/people-props.ts:14`); neither reads `role` for anything the owner wants kept — the plan confirms.

## 4. R3 — a blank-name or guest user shows their email

**Today.** Most sites fall back name → email → id (`packages/app-core/src/member-label.ts:69-101`), but the email is often not in hand: `/actor-names` drops blank names and never carries an email (`routes/builder-reads.ts:311-324`); `/members` hides guests from non-admins (`read/membership-roster.ts:43`); and some sites print the id with no lookup at all — the List's "closed by" and custom-field "set by" tooltips (`ticket-list.tsx:1150`, `:1235`), My Work's contested-claim line (`packages/domain/src/events/contest-events.ts:148-156`), and the visibility editor's chips (`visibility-editor.tsx:373-376`, roster only). A guest VIEWER gets 404 from both `/members` and `/actor-names` (`builder-reads.ts:740`, `:762`), so everyone shows as an id to them.

**Decision.**
- N1. `/actor-names` returns every workspace member including guests, with the **email as the label when the name is blank** (synthetic phone addresses excepted: those show the phone number, formatted) — the server already does this at `people.ts:62` and `invites.ts:54-63`.
- N2. The four id-only sites go through the shared label (`actorLabelFrom` with the actor-names map).
- N3. **A guest viewer sees labels only for the people on tickets they can see** (the payloads they already receive carry those people's labels), not the whole directory — R2 refuses guests the email lookup, and handing them every member's email through `/actor-names` would give back more than R2 withholds. **Owner ruling 2026-09-29 (evening): "go with the recommendation"** — the narrow option; widening later is a one-line change, narrowing after exposure is not.
- N4. A raw id is never shown as a person's name anywhere; a truly unknown id (deleted account) reads "Unknown person".

## 5. R4 — a link opened by the wrong account is refused

**Today.** Link acceptance (`POST /v1/invites/:token/accept`, `routes/invites.ts:468-511` → `invites/acceptance.ts:122-219`) never compares the accepting account with the address; `openableInvite` does not even select it (`invites.ts:622-626`). This was deliberate ("bearer-authorised", `invites.ts:288-300`). The in-app banner door already requires a match (`routes/my-invitations.ts:211-226`, refusal `INVITATION_NOT_YOURS_BODY` `:84-88`).

**Decision.**
- I1. **Email-channel invite:** accepted only by an account whose verified email equals the address (case-insensitive, the banner door's comparison `my-invitations.ts:147`).
- I2. **Phone-channel invite:** accepted only by an account whose verified phone equals the address; an account with no verified phone is refused.
- I3. The check runs **before** `consumeInviteToken` (`invites.ts:490`), so a wrong-account attempt does not burn the link.
- I4. Copy (server-side, shown verbatim by the accept page `apps/web/app/invite/[token]/page.tsx:105-115`): "This invitation was sent to b•••@gmail.com. Sign in with that account to accept it." The address is masked, so the link does not leak it.
- I5. The shipped spec's bearer rule is amended; the banner and link doors now agree.

## 6. R5 — Remove from workspace

**Today.** The event exists, the UI does not: `membership.revoked` (`packages/domain/src/vocabulary.ts:393-398`) is accepted from owners/admins (`permissions/check-permission.ts:716-739`) with a last-owner guard (`packages/rule-engine/src/checks/membership.ts:9-14`); it deletes the workspace-scope membership row (`projections/proj-memberships.ts:106-118`), and sync sends the lost-scope purge (`visibility/visible-events-for.ts:317-335`).

**Decision.**
- M1. The Members page row gains **Remove from workspace…** for an owner or admin (not on their own row, not on the last owner). A confirm dialog names the person and what happens.
- M2. It emits `membership.revoked`. **History is kept**: their events, comments and authorship stay, labelled with their name or email.
- M3. **Their pending invitations to that address are revoked** in the same step, so an old link cannot bring them back.
- M4. **Tickets stay assigned to them**, marked "(removed)" beside the name, so the team can see what needs reassigning. Explicit lists keep their id (it confers nothing, `can-see.ts:62`).
- M5. Access ends at once: REST re-resolves role per request; the live stream gives a null-role reader nothing (`visible-events-for.ts:183-189`). The plan confirms an open stream is closed or goes quiet.
- M6. Out of scope: "Leave workspace" for oneself (the event already allows it; a UI door is a follow-up), and removing someone from ONE project (rule A makes members see every project).

## 7. R6 — invite send: progress now, cause measured

**The path** (`routes/invites.ts:338-417`): ingest `invite.sent` → token insert → two small reads → **`await mailer.send()` inside the request** (`:402-409`). The SMTP transport is created **per send with no pooling** (`invites/invite-mailer.ts:81`; timeouts connect 10 s / greeting 10 s / socket 20 s, `auth/smtp-magic-link-sender.ts:32-36`). The magic-link sender has the same shape and is also awaited in its request (`auth/auth.ts:341-343`).

**Measured (production run logs, read 2026-09-29 evening; Fastify `responseTime` of each request):**

| Request | UTC | Response time |
|---|---|---|
| `POST …/invites` — the FIRST send after the 07:17 deploy | 07:30:00 | **18,379 ms** (201) |
| `POST …/invites` — 3½ min later | 07:33:25 | **2,949 ms** (201) |
| `POST /api/auth/sign-in/magic-link` | 07:33:49 | **2,952 ms** (200) |

So the 18 s is a **first-send penalty of ~15 s**, paid once per cold process (and, per the DNS cache, again after 5 idle minutes); every send then costs **~3 s** — the invite and the magic link alike, the unpooled connection. The causes below are ranked against those numbers; the per-phase split is still unmeasured.

**Causes, ranked:**
1. **First send: cold DNS + an IPv4/IPv6 choice with a 10 s stall** (the ~15 s penalty). nodemailer resolves A and AAAA and picks an address at random; if an IPv6 connect is silently dropped it waits the full 10 s `connectionTimeout`, then falls back. 10 s + a normal cold send ≈ 18 s. Nothing logs the fallback today (nodemailer's logger is off).
- *Ruled out:* the SMTP port being filtered (every address would time out and the send would FAIL) — the 2026-09-29 production check showed "Invitation emailed to …" and the email arrived.
2. **Every send: a cold connection** (TCP + TLS + AUTH, no pool) — the measured ~3 s floor; a dev send measured 4.2 s.
3. DNS alone (first send per 5 min) — part of cause 1.

**Decision.**
- S1. **Measure first:** per-phase timing logs around the invite handler (ingest, insert, reads, send) and nodemailer's `logger` enabled for the connection phase (connect target, family, fallback), for both the invite and magic-link senders. One deploy with the release; the owner times 3–4 invites.
- S2. **Fix:** one **pooled** transporter per sender, reused across sends and kept warm (removes the ~3 s floor and the per-send DNS), for invite and magic link alike; then, if S1 shows the family fallback, an **IPv4-first** connection — the plan must first confirm nodemailer exposes an option for it (else resolve the host to an IPv4 address ourselves and pass the name for TLS). The timeouts stay.
- S3. **The button shows progress regardless:** disabled with "Sending…" while the request is in flight; the address clears on success; a second submit while one is in flight does nothing.
- S4. **Server dedupe:** a second invite to an address that already has a PENDING invite in the same workspace re-sends that invite rather than minting another (`invites.ts:341` mints a new id today; there is no uniqueness, `projections/proj-invites.ts:67-71`). **Open for the plan:** if link tokens are stored hashed, the original link cannot be re-emailed — "re-send" then means rotating the token on the existing invite (the old link stops working).
- S5. Sending the email after the response (fire-and-forget) is **not** chosen: the result card promises "Invitation emailed to …" and must stay true.

## 8. R7 — the new-note flash

**Cause** (not share state): `apps/web/src/notes/note-document.tsx:149-185` — the search loop finds the note with `getNote`, discards it, and sets `resolvedWorkspaceId` + `searched` together; that changes the `useLiveQuery` key, which resets `data` to null and refetches (`packages/app-core/src/views/use-live-query.ts:145-153`). For one round-trip `searched && note === null` renders "That note is no longer shared with you." (`:574-579`). It happens on **every** note open, not only new notes.

**Decision.** Keep the note the search loop found and use it as the live query's initial value for that key, so the component never has `searched && note === null` unless the note truly is not readable. A test pins "no lost-access copy on a normal open".

## 9. Riders from the 2026-09-29 production cleanup

- C1. **The delete dialog's switch is named "on" for assistive tech** instead of "Delete permanently" (observed in the ticket and note delete dialogs). The switch gets its visible label as its accessible name.
- C3. **A magic-link token is written to the production request log in plain text.** The `GET /api/auth/magic-link/verify?token=…` URL is logged verbatim (seen 2026-09-29, 07:34 UTC), while invite tokens are already logged as `[redacted]`. The request logger's URL redaction must cover the magic-link verify query (and any other auth callback carrying a code or token). The token is single-use and expires in 15 minutes, so the exposure is small, but a log should never hold a sign-in credential.
- C2. **A deleted card lingers ~1–3 s on the board** after the "deleted" toast. The board removes the card when the delete is accepted locally, not when the next read arrives (plan to confirm where the lag comes from before choosing the fix).

## 10. Order

S3 + S4 + C1 + C3 + R7 first (small, user-visible, and the log fix); S2 (pooled transporter) with them, since the measured ~3 s floor already justifies it; R2, R3, R4 (server + label work); R1 (the arm's extension across every reader); R5 (new UI on an existing event); S1 timing logs ship with the release, and decide whether the IPv4-first half of S2 is needed.
