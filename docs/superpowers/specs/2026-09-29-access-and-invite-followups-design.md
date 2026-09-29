# Access and invite follow-ups — design

**Status:** spec for owner review. Written 2026-09-29 (evening) by the planner, from the production follow-ups of the access release (#761) and the owner's rulings the same evening.
**Base:** `origin/main` at `bd7440bc` (= `release/2026-09-29` at cut). Citations are a read-only research pass over that tree; the plan re-reads each before building on it.
**Target branch:** `release/2026-09-29`.
**Precedes:** `2026-09-29-workspace-access-and-invites-design.md` (shipped). This spec amends two of its decisions (W3's "no implicit append" and the bearer-authorised invite link) on the owner's word.

## 1. The owner's rulings (2026-09-29 evening), verbatim where quoted

| # | Item | Ruling |
|---|---|---|
| R1 | Assigning someone to an explicit-list ticket | *"assignee should always be added to the explicit-list"* |
| R2 | Email lookup reveals the person's role; guests can use it | as recommended: drop the role, refuse guests |
| R3 | Users with a blank name, and guests, show raw ids | *"show email."* |
| R4 | An invite link accepted by an account it was not addressed to | *"refuse"* |
| R5 | No way to remove a member from a workspace | as recommended: spec an owner/admin "Remove from workspace", history kept |
| R6 | Invite send takes ~18 s with no progress (double-send risk) | *"as recommended. also look into why it actually takes 18s."* — progress + disabled button, and find the cause |
| R7 | A new note flashes "no longer shared" for ~1 s | as recommended: fix |

Two small findings from the 2026-09-29 production cleanup ride along (§9).

## 2. R1 — the assignee joins the explicit list

**Today.** No path adds an assignee to a ticket's explicit list, by design: *"The explicit list is exactly the authored list. Creator and assignee are not implicitly appended"* (`apps/server/src/visibility/can-see.ts:58-60`). Instead a read-time **assignee arm** lets the CURRENT assignee see the ticket (`can-see.ts:193-206`, checked after the audience at `:288-297`); it reads live `proj_tickets.assignee_id`, so unassigning removes access at once. The arm does not open inherited notes or sub-tickets.

**Decision.**
- A1. When a ticket's audience is an **explicit list** and an assignment names someone NOT on it, the server adds them to the list **in the same accepted batch** as the assignment, as a normal visibility change attributed to the assigning actor. This covers every door that assigns: the ticket sheet (`ticket.assigned`), the New-ticket dialog (`ticket.created` with `assigneeId`), and assign-outsider (`routes/people.ts:196-203`, which grants guest membership first).
- A2. It is an **authored** change, so it stays after the person is unassigned (removing them from the list is an ordinary visibility edit). That is the difference from today's arm and the reason this is a behaviour change: the assignee also gains what the list confers — notes and sub-tickets that inherit the ticket's list.
- A3. No extra authority check (the owner's ruling; recorded as closing access finding 10 in the other direction: assigning *is* permission to add the assignee to the list).
- A4. Project- and workspace-scope tickets are unchanged: the assignee arm still covers an assignee outside that scope (a guest assignee sees that one ticket).
- A5. The docblock at `can-see.ts:58-60` and the shipped spec's W3 are amended to say so; history shows the list change as its own line beside the assignment.

**⚠ Re-confirm A2 with the owner before planning R1.** The ruling was given on a premise the planner misstated in chat ("assigning adds them to its visibility" — it does not; today only the read-time arm applies). The deciding question: *once someone is unassigned, should they keep seeing the ticket and the notes and sub-tickets that inherit its list?* Yes → A1–A5 as written. No → keep today's arm and extend it to inherited notes/sub-tickets instead. This blocks building R1, not merging this spec.

**Open for the plan:** whether the append is a separate `visibility.*` event in the batch or a field on the assignment event. Recommendation: a separate, ordinary visibility event — every reader of the list already understands it.

## 3. R2 — email lookup: no role, no guests

**Today.** `POST /v1/workspaces/:id/people-lookup` (`routes/people.ts:112-132`, `lookupPerson` `:46-67`) returns `role` and `inWorkspace` (`:24-30`, `:64-65`); the only gate is `requireMember` (`:127`), which admits guests (`read/membership.ts:60-67`).

**Decision.** Drop `role` from the response. Refuse a guest caller (the same refusal shape as other member-only reads). Keep `inWorkspace` — the pickers need it to choose between "assign" and "assign and add as guest". Callers: the invite form (`members/page.tsx:786-798`) and the assignee pickers (`apps/web/src/people-props.ts:14`); neither reads `role` for anything the owner wants kept — the plan confirms.

## 4. R3 — a blank-name or guest user shows their email

**Today.** Most sites fall back name → email → id (`packages/app-core/src/member-label.ts:69-101`), but the email is often not in hand: `/actor-names` drops blank names and never carries an email (`routes/builder-reads.ts:311-324`); `/members` hides guests from non-admins (`read/membership-roster.ts:43`); and some sites print the id with no lookup at all — the List's "closed by" and custom-field "set by" tooltips (`ticket-list.tsx:1150`, `:1235`), My Work's contested-claim line (`packages/domain/src/events/contest-events.ts:148-156`), and the visibility editor's chips (`visibility-editor.tsx:373-376`, roster only). A guest VIEWER gets 404 from both `/members` and `/actor-names` (`builder-reads.ts:740`, `:762`), so everyone shows as an id to them.

**Decision.**
- N1. `/actor-names` returns every workspace member including guests, with the **email as the label when the name is blank** (synthetic phone addresses excepted: those show the phone number, formatted) — the server already does this at `people.ts:62` and `invites.ts:54-63`.
- N2. The four id-only sites go through the shared label (`actorLabelFrom` with the actor-names map).
- N3. **A guest viewer sees labels only for the people on tickets they can see** (the payloads they already receive carry those people's labels), not the whole directory — R2 refuses guests the email lookup, and handing them every member's email through `/actor-names` would give back more than R2 withholds. **Owner question:** open `/actor-names` to guests in full instead (the deployment is private to one team)?
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

**Likely causes, ranked (unmeasured):**
1. **IPv4/IPv6 choice with a 10 s stall.** nodemailer resolves A and AAAA and picks an address at random; if an IPv6 connect is silently dropped it waits the full 10 s `connectionTimeout`, then falls back. 10 s + a normal cold send ≈ 18 s. Nothing logs the fallback today (nodemailer's logger is off).
- *Ruled out:* the SMTP port being filtered (every address would time out and the send would FAIL) — the 2026-09-29 production check showed "Invitation emailed to …" and the email arrived.
2. **A cold connection every send** (DNS + TCP + TLS + AUTH, no pool; a dev send measured 4.2 s).
3. DNS (first send per 5 min).

**Decision.**
- S1. **Measure first:** per-phase timing logs around the invite handler (ingest, insert, reads, send) and nodemailer's `logger` enabled for the connection phase (connect target, family, fallback), for both the invite and magic-link senders. One deploy with the release; the owner times 3–4 invites.
- S2. **Fix what the measurement names;** the plan carries both candidate fixes behind the measurement: one **pooled** transporter reused across sends, and **IPv4-first** connection if the fallback shows up — the plan must first confirm nodemailer exposes an option for it (else resolve the host to an IPv4 address ourselves and pass the name for TLS). The timeouts stay.
- S3. **The button shows progress regardless:** disabled with "Sending…" while the request is in flight; the address clears on success; a second submit while one is in flight does nothing.
- S4. **Server dedupe:** a second invite to an address that already has a PENDING invite in the same workspace re-sends that invite rather than minting another (`invites.ts:341` mints a new id today; there is no uniqueness, `projections/proj-invites.ts:67-71`). **Open for the plan:** if link tokens are stored hashed, the original link cannot be re-emailed — "re-send" then means rotating the token on the existing invite (the old link stops working).
- S5. Sending the email after the response (fire-and-forget) is **not** chosen: the result card promises "Invitation emailed to …" and must stay true.

## 8. R7 — the new-note flash

**Cause** (not share state): `apps/web/src/notes/note-document.tsx:149-185` — the search loop finds the note with `getNote`, discards it, and sets `resolvedWorkspaceId` + `searched` together; that changes the `useLiveQuery` key, which resets `data` to null and refetches (`packages/app-core/src/views/use-live-query.ts:145-153`). For one round-trip `searched && note === null` renders "That note is no longer shared with you." (`:574-579`). It happens on **every** note open, not only new notes.

**Decision.** Keep the note the search loop found and use it as the live query's initial value for that key, so the component never has `searched && note === null` unless the note truly is not readable. A test pins "no lost-access copy on a normal open".

## 9. Riders from the 2026-09-29 production cleanup

- C1. **The delete dialog's switch is named "on" for assistive tech** instead of "Delete permanently" (observed in the ticket and note delete dialogs). The switch gets its visible label as its accessible name.
- C2. **A deleted card lingers ~1–3 s on the board** after the "deleted" toast. The board removes the card when the delete is accepted locally, not when the next read arrives (plan to confirm where the lag comes from before choosing the fix).

## 10. Order

S3 + S4 + C1 + R7 first (small, user-visible); R2, R3, R4 (server + label work); R1 (visibility write, with its history line); R5 (new UI on an existing event); S1 measurement ships with the release, S2 follows the numbers.
