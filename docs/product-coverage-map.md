# Coverage map — `Features.md` ✅ bullets against the two persona documents

**What this is.** `Features.md` marks every bullet `✅ user-observable`, `⚙️ internal subsystem`, or
`? inferred/unverified`. This document walks the `✅` bullets one at a time and says where — if
anywhere — the two persona Q&A documents address them. It exists so that "the whole user-facing
feature set is documented" is a claim somebody can check rather than one they have to take on trust.

**Sources.**

- Two persona-driven Q&A passes, cited as **P§n** (13 sections, 162 Q&A pairs) and **R§n** (10
  sections, 96 Q&A pairs). **These two drafts are NOT in this repository** — they are machine-local
  working documents, and they deliberately stay out because they still contain the *uncorrected*
  versions of the six disagreements settled in "Corrections the map forced" below. Anything sourced
  from them directly would reintroduce claims this map already refuted. The corrected text is what
  landed in `manual.md`, `faq.md` and the README.
- `Features.md` (this repository) — bullets cited by line number and verbatim title. **Line numbers
  are a snapshot**, taken when this map was written; the verbatim titles beside them are what will
  still find the bullet after the file moves underneath them.

**Counting rule (so 95 is reproducible).** A bullet counts when its line matches `-` + optional
leading whitespace + `✅`. That yields **95**. It includes the two indented sub-bullets at L70 and
L1652. It excludes the legend line at L3, and it excludes the six places where the `✅` glyph appears
inside `⚙️` prose (L954, L1591, L1784, L1791, L2211, L2213, L2228, L2229) rather than as a bullet's
own mark.

---

## Headline numbers

| Verdict | Count | Meaning |
|---|---:|---|
| **Covered** | **74** | Names something a non-technical user can observe, and at least one persona addresses it |
| **No user-observable surface** | **18** | Marked ✅, but nothing a user can see — internal doors, credential hygiene, sweeps, test suites, seed scripts. The user-visible *consequence* is named where one exists |
| **Not covered** | **3** | User-observable, and neither persona describes it |
| **Total** | **95** | |

**The three not covered**, all in the same family — what a user sees when work becomes visible to
them, rather than when it stops being visible:

1. **L1611** *A re-widened ticket comes back even if the client read something else meanwhile* — a
   job that is re-shared with you reappears on your device without a reload. Neither persona
   describes the widening side. Both describe the narrowing side.
2. **L1731** *Visibility that widens because the READER's reach grew, not the ticket's* — when you
   are added to a project or granted membership, the work already in it appears. Neither persona
   describes it.
3. **L1661** *`POST /v1/sync/reconcile` — the client names what it holds and the server says what is
   no longer theirs* — **and both personas carry the opposite, stale claim.** P§12 and R§9 both say
   an un-shared job leaves a stale copy on your device until a full refresh. That was the defect this
   bullet closes: the device now presents what it holds on each reconnect and deletes what it is told
   it no longer has. Anything written from the personas alone would have shipped the closed defect as
   current behaviour.

None of the three is "not yet reachable in the UI." All three are real, shipped behaviour that the
personas' pass simply did not reach — which is unsurprising, since all three only show themselves on
a device that was disconnected and came back.

---

## Corrections the map forced

Six places where the personas disagreed with each other, or with reality. Each was settled against
`Features.md` or against the shipped screens, not by preferring one persona. **These corrections are
carried into the README, manual and FAQ; the persona documents themselves still contain the
uncorrected versions.**

| # | The disagreement | Settled | Evidence |
|---|---|---|---|
| C1 | Phone sign-in: P§1 says the Phone tab fails and tells you to use email; R§1 gives step-by-step instructions for it | **Priya.** Phone sign-in is refused in the shipped deployment | L2097: the shipped code refuses every one-time-code send with a "phone sign-in unavailable" answer, and is asserted never to fall back to the developer sender |
| C2 | R§1 says the workspaces list, My Work, and the attention strip cannot load real data | **Stale.** All three serve now | L47/L48/L781: the reads for workspaces, My Work, attention, the ticket list and a single ticket all answer now; **twelve of thirteen** reads serve, and the one still refusing is search |
| C3 | P§4 lists the description as one of three things you can change on a job; R§6 says it is read-only with no box to type in | **Robert, WHEN THIS WAS WRITTEN — and the product has since moved to P§4.** ✅ **CORRECTED 2026-09-19** | Then: the shipped mount passed six things to the job sheet and no editor among them, so the read-only fallback was what rendered, under its own note (*"it renders and it does not compose … by having no control to type into rather than by offering one that silently discards what is typed"*). **Now:** `page.tsx` passes `editorSlot={TicketEditorSlot}`, and `TicketSheet` draws the description row whether or not a claim exists — `ticket.created` writes `fields.title` and nothing else, so on an undescribed ticket the row itself used to be absent, which enabling the composer alone would not have fixed. **Comments are still unwritable — see bullet 4** |
| C4 | P§6 asks, as a feature request, to at least let people rename the built-in job types | **Already possible.** Only the *rank* of a built-in type is locked; its name, icon and stage set stay an admin's to change | L116 |
| C5 | R§4 says to reach the stage builder by going to your workspace's settings and finding Workflows; P§2/§6 says nothing links to those screens | **Priya.** The six authoring screens exist and nothing in the app links to any of them | L1772: *"Nothing in the app links to any of them yet … today they are reached by typing the URL"* |
| C6 | Both personas describe attaching files and picking from Drive as things you do on a job | **Neither is reachable on the web — ONE exception, closed 2026-09-19.** The upload and download routes ship on the server, but the web's job sheet is still mounted without an attachment list, and the writing box that would accept a dropped file is not mounted, so a file cannot be attached *to a job* for its own sake. **An EVIDENCE uploader IS mounted now** (the transition dialog's `uploadEvidence`, supplied by the page), so a `require-evidence` move can be satisfied — a different thing from attaching a file to a job, and it does not make the sentence above false | L1012 for the routes; the shipped mount for the remaining absences |

A seventh point is **not** a correction but is worth recording: `Features.md` L60 says the
"Who can see this" editor's mount is dark because the single-ticket read refuses. That sentence
predates the change at L47/L48 and is now stale by the same mechanism C2 describes. The editor is
mounted and is offered to everyone; the server refuses the submission from anybody without the
rights. R§5's description of an ordinary member seeing a note and no controls describes the
component's other mode, which the web does not use.

---

## §3 — Foundation & event ledger (12 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 1 | 50 | `apps/web` — the Next.js 15 App Router shell | Covered | P§2 (three-link menu), P§8 (view tabs), P§12 + R§1 (light/dark toggle cycling system→light→dark). **Note:** the bullet's own route list names Board and List tabs; the shipped page has five — Backlog, Board, List, Calendar and Timeline, in that order (`page.tsx:1756-1760`) — and the personas are right |
| 2 | 51 | Passwordless sign-in, all four methods and nothing password-shaped | Covered | P§1, R§1. Correction **C1** applied — phone is refused |
| 3 | 52 | A refused read is rendered as the refusal | Covered | P§1 + R§1 (an expired session says so and takes you to sign in, then returns you where you were going); P§13 + R§10 (a genuine failure shows one plain sentence, never technical wreckage) |
| 4 | 53 | The list can be asked a smaller question, and says so on every surface that answers it | Covered | P§8 (the exact note, and the Board exemption), R§7. P§8 also has the 2,000-job ceiling and that narrowing is the way back under it |
| 5 | 54 | The New-ticket control asks before it offers, and withholds itself rather than assert an absence | Covered | P§4 (three fields; the button disappears past the ceiling), R§2 (step by step). *Thin:* neither names the built-in ladder shown as a labelled stand-in while the real list loads |
| 6 | 57 | Invite links — minting, holding, accepting, withdrawing | Covered | P§3, R§5 — including the shown-once link, what the recipient sees before signing in, and withdrawal |
| 7 | 58 | Founding a workspace | Covered | P§2, R§1 — one name box; the name is kept exactly as typed, spaces and all |
| 8 | 59 | The people page, gated by the server's own 403 | Covered | P§3, R§5 — a plain member sees the roster and no invitation machinery |
| 9 | 60 | "Who can see this" — the visibility editor | Covered | P§10 (four modes; the owner line on every mode; the lockout warning that changes nothing), R§5. Both flag that the current setting cannot be read back |
| 10 | 61 | An empty board says words, not nothing | Covered | P§8 (the exact wording, and why it says "no tickets" and not "no columns"), R§5 |
| 11 | 69 | Event ingest API | No user-observable surface | The door itself. Consequence — a refusal reaches you in the server's own words — is P§5 and R§3 |
| 12 | 70 | Envelope-origin gate (partial permission gate) | No user-observable surface | Provenance forgery guard |

## §5 — Tickets, hierarchy & rollups (7 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 13 | 112 | Hierarchy sanity refusals on creation | Covered | P§4 (the rank rule; bottom-rank types must have a parent; the reopen offer coming last), R§2 |
| 14 | 113 | Hierarchy sanity refusals on reparenting | Covered | P§4 (loops refused, including the clever ones; parents must be in the same project). **Flag:** the rules are real, but no screen in the web app moves a job to a different parent — R§2 says you can and could not point at a control |
| 15 | 114 | Workflow migration checks | Covered | P§6, R§4 — pointing a job type at a different stage set leaves existing jobs where they are; moving them is a separate, deliberate step |
| 16 | 115 | Field claim checks | Covered | R§2 (a value that does not fit its field is refused at once and the field is named), P§5 (the require-a-field prompt) |
| 17 | 116 | Built-in rank lock, enforced at the server | Covered | P§6 (the lock and its message), R§2. Correction **C4** applied |
| 18 | 117 | Malformed-payload refusals name their field | Covered *(thin)* | R§2 — "it'll tell you exactly which field is the problem" |
| 19 | 123 | Ticket history endpoint | Covered | P§4 + R§1 — the History tab, in order, with who and when; two clocks per line; stops at 200 with a note and no way further back |

## §6 — Server core: auth, membership & visibility (22 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 20 | 133 | Session hygiene | Covered | P§1 — signing out really ends it on the next action, and signing in never adopts something already sitting on the machine |
| 21 | 137 | Ingest enforces visibility: nobody may act on a ticket they cannot see | Covered | P§10, R§5 |
| 22 | 138 | Who may retarget a ticket's audience, and who may create one | Covered | P§10 (a project admin of *that* job's project, or whoever created it), R§5 |
| 23 | 141 | A founded workspace arrives usable | Covered | P§2 — you become owner, you get a simple to-do/doing/done arrangement and four built-in job types. **Note:** the bullet's own phrase "found, create a project" describes an intention; the **New project** form on the workspace page is what reaches it, and only an owner or admin is offered that form (`page.tsx:917-923`) |
| 24 | 142 | Founding cannot be used to seize an existing workspace | No user-observable surface | Attack-path guard |
| 25 | 143 | Event submission requires a session | Covered *(thin)* | P§1 — signed out, the next thing you try is refused straight away |
| 26 | 149 | Reads enforce visibility, and an invisible ticket is indistinguishable from one that never existed | Covered | P§10, R§5 — both explain that "not found" is deliberately the same answer for both cases, and why |
| 27 | 150 | The restricted-parent placeholder, and the existence it must NOT invent | Covered | R§2 + R§5 (the clearer of the two), P§4. R§5 adds that a chain of hidden parents only ever discloses the one directly above |
| 28 | 151 | A served row goes out through an allow-list | No user-observable surface | Consequence — you cannot see who else a job is shared with, or which parent it took its audience from — is P§10 |
| 29 | 152 | Provenance is never redacted from someone entitled to the state | Covered | P§10 — "you can hide the *work*; you can't hide *who acted*" |
| 30 | 153 | Rollup honesty — the true total, with the restriction NAMED | Covered | P§4 ("5 of 8 done · 2 restricted", and why the honest total matters), R§2. R§2 also adds the honest caveat that he could not confirm whether the restricted count breaks down by finished/unfinished |
| 31 | 154 | The sync-down visibility filter | Covered | P§12 (work you lose access to is actively removed from your screen), R§9 |
| 32 | 155 | A device whose owner was put out of the workspace is told | Covered | P§11 (told once, nothing more arrives, and not told *which* things were lost), R§7 |
| 33 | 161 | Route-level security, proven end to end | No user-observable surface | A test suite |
| 34 | 162 | Founding a workspace through the product | Covered | P§2 (a name of only spaces is refused with "A workspace needs a name"; the name is not trimmed), R§1 |
| 35 | 163 | The workspace directory | Covered | P§2 — the page lists each workspace with its projects underneath as links; the workspace heading itself is not a link. Correction **C2** applied against R§1 |
| 36 | 164 | Invitations — an address is a claim, not an identity | Covered | P§3 (no owner role offered; a guest invitation cannot carry projects; re-inviting an existing guest as a member silently does nothing), R§5 |
| 37 | 165 | An invitation link lapses and is spent — spent by ONE person | Covered | P§3 — fourteen days as a placeholder nobody has signed off; one link, one person; the race that used to let three in is fixed |
| 38 | 167 | An invitation's address reaches owners and admins and nobody else | Covered | R§5, P§3 |
| 39 | 169 | The invitation token does not reach the process log | No user-observable surface | Credential hygiene |
| 40 | 170 | A dead invitation link stops costing anything | No user-observable surface | Credential store collection |
| 41 | 171 | Per-user data does not outlive the relationship that justified it | Covered | R§5 (kept for thirty days, described as a placeholder; re-add within the window and the settings come back), P§3 ("about a month") |

## §7 — API, realtime & search (10 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 42 | 385 | `GET /v1/projects/:projectId/board` | Covered | P§8 — one column per stage, columns grouped by which stage set they belong to, blocked read off the stage rather than the job. R§3 has the clearest explanation of blocked being a property of the column |
| 43 | 407 | The board's door: 401, 404, 404, 200 | Covered | P§8 (a workspace member not on a project gets an empty board, and that is the right answer, not an error), R§5 |
| 44 | 421 | `GET /v1/projects/:projectId/tickets` — the project list read | Covered | P§8 (five groupings that rearrange without hiding or changing counts; chosen columns), P§11 (pages of fifty, fixed repeatable order, the 2,000 ceiling), R§7 |
| 45 | 451 | The builder read surface | Covered | P§6 (the workflow list and the job-type list with their counts), R§4. Guests refused the roster: P§3 |
| 46 | 493 | The bulk workflow rebind | Covered | P§6 (a separate step that makes you map every stage in use, and names what you missed), R§4 |
| 47 | 519 | `GET /v1/search` — workspace-wide, visibility-filtered full text | Covered | P§11 and R§7 both describe the behaviour and both report that no screen on the web reaches it. P§11 has exact-word matching and no searching inside attachments; R§7 has title-over-comment ranking and the fifty-result bound |
| 48 | 554 | `GET /v1/me/work` | Covered | P§8 (the Recently assigned strip, ordered by the system's clock so a wrong laptop clock cannot jumble it), R§1. Correction **C2** applied |
| 49 | 616 | `GET /v1/workspaces/:workspaceId/attention` | Covered | P§9 (three kinds in order, each carrying its own sentence; the strip is absent rather than empty when nothing needs you; both thresholds adjustable, seven days by default), R§1 + R§8. Correction **C2** applied |
| 50 | 649 | View preferences | Covered | P§8 (the "default arrangement — you have not arranged this project" note, and that it can speak about only half), P§11 (saved filters built and connected to nothing), R§5 (settings kept after removal), R§7 |
| 51 | 688 | `WS /v1/stream` — the route, and the only door the stream has | Covered | P§11 (live updates with no refresh; catch-up then up-to-date then live; reconnects and resumes; a small number of connections per person), R§7 |

## §9 — Editor, documents & attachments (1 bullet)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 52 | 1012 | `POST /v1/attachments` and `GET /v1/attachments/:id` | Covered | P§7 (uploaded files versus Drive pointers, the progress chip, a failed upload leaving nothing broken), R§6 (the 25 MB ceiling; the file's real content is checked, not its name). Correction **C6** applied — the behaviour is described accurately but is **not reachable from the web today** |

## §12 — Offline sync & the apps (24 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 53 | 1165 | A contest cannot lie about which claim it is contesting | No user-observable surface | Forgery guard |
| 54 | 1218 | `GET /v1/contests` | Covered | P§12, R§9 — the disputed-claim banner and what it carries |
| 55 | 1335 | `GET /v1/sync/bootstrap` | No user-observable surface | Consequence — what is on the device to work from offline — is P§12 |
| 56 | 1366 | `POST /v1/sync` | No user-observable surface | Consequence — a refused offline change becomes a disputed claim you are shown — is P§12 and R§9 |
| 57 | 1379 | A refusal whose contest the server's own door refuses is answered, not 500'd | No user-observable surface | Consequence — a queue that cannot wedge — is P§12 |
| 58 | 1394 | The client's offline claim goes through the GATED door | No user-observable surface | Consequence — "being offline buys an event nothing" — is P§12 |
| 59 | 1465 | Instant, named refusals offline — the SAME engine | Covered | P§12 (an obviously illegal change is refused on the spot, in the rules' own words, and never queues), R§9 |
| 60 | 1467 | The outbox — ordered, persisted claims in transit | Covered | P§12 (order preserved so a job is never edited before it is created; queue survives closing the app), R§9 |
| 61 | 1489 | `ListRow.pending` — and it RENDERS now | Covered | R§9 — the "claim in transit" badge appears both on the board and in job lists |
| 62 | 1496 | The contested-claim banner shows the claim verbatim, and the "when" is India time | Covered | P§12 (with the exact shape of the sentence), R§9 |
| 63 | 1503 | Three resolutions, each of them recorded events rather than a mutation | Covered | P§12 (discard / convert to comment / redo legally, and why convert-to-comment is the useful one), R§9 (adds the optional note on discard) |
| 64 | 1518 | The offline reopen pair, in the only order that can pass | Covered | P§12 — reopening a finished parent and then filing under it both work offline, where filing alone would not |
| 65 | 1530 | Gross clock skew renders as a flag attributed to the DEVICE | Covered | P§12 — "device clock ran 11 min ahead of the server"; nothing shown under ten minutes; the wording blames the clock, not the event |
| 66 | 1535 | The sync-truth strip both apps mount | Covered | P§12 (every state named, singular handled, no alarming badge when healthy), R§9 |
| 67 | 1545 | The stream's own error, said out loud without claiming a policy that does not exist | Covered | P§12 — the message sits beside the status rather than replacing it, in the server's own words, ending "still retrying", and is forbidden from ever saying it will not reconnect |
| 68 | 1594 | Contest resolution and sync status use the real app-core helpers | Covered | P§12, R§9 |
| 69 | 1596 | Six scripted divergences, asserted exactly | No user-observable surface | A test suite. Consequence — a plain race is resolved silently, later wins, earlier survives in history, nobody is told — is P§12 |
| 70 | 1611 | A re-widened ticket comes back even if the client read something else meanwhile | **Not covered** | Neither persona describes the widening side. Both describe the narrowing side |
| 71 | 1634 | `GET /v1/sync/bootstrap/ticket` | No user-observable surface | Fetch route behind the notice at #70 |
| 72 | 1643 | A pull that fails is remembered, not fatal and not forgotten | No user-observable surface | Consequence — a network wobble does not brick the device — is P§12 in general terms |
| 73 | 1652 | …and an id the server will never serve is dropped | No user-observable surface | Bound on the above |
| 74 | 1661 | `POST /v1/sync/reconcile` | **Not covered** | And **both personas carry the closed defect** — P§12 and R§9 say an un-shared job leaves a stale copy until a full refresh. It is now taken away on reconnect |
| 75 | 1684 | The backfill was an ATOMIC burst that could wedge a subscriber — the MECHANISM is gone | No user-observable surface | Consequence — a very large share is bounded at 200 jobs — is P§12 |
| 76 | 1731 | Visibility that widens because the READER's reach grew | **Not covered** | Neither persona describes what you see when you are added to a project that already has work in it |

## §10 — Workflow builder & ticket types (11 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 77 | 1762 | Workflow canvas | Covered | P§6 (boxes, the category picker, the blocked box, the start marker, dragging edge to edge to make an arrow), R§4 |
| 78 | 1763 | Rule editors | Covered | P§6 (exactly five rules and no more, each written out in plain language on the arrow), R§3 + R§4. *Not covered:* that a failed roster read renders as "nobody is in this workspace" — a known dishonesty disclosed in the bullet itself |
| 79 | 1764 | Live validation | Covered | P§6 (the list of blocking issues, each clickable to the offending box or arrow, and the all-clear sentence), R§4 |
| 80 | 1765 | Advisories — warnings that do not block | Covered | P§6 (the exact heading, and that a guard on one route in can be walked around by another route), R§4 |
| 81 | 1766 | Publish flow | Covered | P§6 (version bump; jobs stay on the version they were created under; the mapping dialog with counts, "unavailable" counts still requiring a decision, and the message naming the stage you missed), R§4 |
| 82 | 1767 | Template gallery | Covered | P§6 (all three named plus blank, and that the waits template deliberately warns about itself), R§4 |
| 83 | 1768 | Workflow list — and the gate the `new` route exists to back up | Covered | P§6, R§3 (a non-admin cannot publish and the fields are switched off) |
| 84 | 1769 | Ticket-type management | Covered | P§6 (rank in plain English; the live "will always need a parent" warning; the five field kinds; a dropdown with no options is refused), R§2 |
| 85 | 1770 | Admin gating | Covered | P§6 (the exact "You can look, not touch" sentence), R§3 |
| 86 | 1771 | System-rules panel | Covered | P§5 + P§6 — the one rule above every workflow, named in the editor as a fixed system rule |
| 87 | 1772 | `apps/web` — the six authoring routes, and the door one of them used to leave open | Covered | P§2 and P§6. Correction **C5** applied against R§4 |

## §11 — Calendar, timeline & notifications (5 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 88 | 1780 | Calendar view | Covered | P§8 (drawn only from claimed days; bar for two dates, single marker for one, two markers and no bar for a contradiction; undated work absent; the sentences for the kinds of empty), R§8. The shipped model selects three of those sentences and only two can render — the third needs a `filter` or a lane that no screen passes |
| 89 | 1781 | Custom date fields on Calendar and Timeline | Covered | R§8 is the clearer ("a start date, a due date, or a custom date field your business set up"); P§8 covers claimed dates generally |
| 90 | 1782 | Claimed-date-field legend | Covered *(thin)* | P§8 lists the legend switch among the reasons a calendar can be empty; neither describes it as a per-field control that is named and counted |
| 91 | 1783 | Timeline view | Covered | P§8 (four weeks at a time; a side list with a heading naming which of five reasons a job is not drawn as a bar), R§8 |
| 92 | 1790 | Inbox | Covered | P§9 (exactly five kinds and the vocabulary is closed; the badge refreshing about once a minute and keeping its last number rather than resetting; click to mark read; the empty message that doubles as an explanation; Load more; a message that outlives your access to what it is about), R§8 |

## §13 — Deployment & dogfooding (3 bullets)

| # | L | Bullet | Verdict | Where |
|---|---|---|---|---|
| 93 | 1825 | Convenience Corner seed runner | Covered | P§13 (twenty-three real errands; it refuses to run if the owner has never signed in; it claims no start date it does not have; running twice does nothing), R§10 |
| 94 | 1828 | Gisik Nokma dev seed | Covered | P§13 |
| 95 | 2148 | Deployed-stack E2E | No user-observable surface | A test suite. Consequence — a guest sees the workspace name but not its projects — is P§2 |

---

## What both personas found that `Features.md` has no ✅ bullet for

The map above runs one way. Run it the other way and four things stand out — real, load-bearing
absences that no `✅` bullet claims, because there is nothing to claim:

1. **No way to create a project, unless you are an admin.** The underlying record and its rules are
   reached by exactly one door — the **New project** form on the workspace page — and only an owner or
   admin is offered it (`page.tsx:917-923`); a member or guest gets the refusal sentence at `:921`
   instead. A workspace whose admins have not used it therefore has nowhere to put work.
2. **No way to assign work on the phone or desktop apps.** On the **website** the job sheet's
   "Assignee" row is a picker (`ticket-sheet.tsx:979`), with an **Unassigned** option that clears it
   (`:984`). Assignment is shown everywhere — on cards, in the Inbox, in My Work, as a grouping in the
   list — and the two native apps set it nowhere.
3. **No way to set a due date.** The calendar, the timeline and the "due soon" list are built entirely
   around claimed dates, and nothing offers to claim one.

   The near-miss is worth recording, because it is easy to mistake for a workaround and it is not one.
   A "require a field to be set" rule puts a plain typing box for that field on the Move dialog, and
   that box is the only thing in the product that takes a field value from a person. **It cannot
   produce a due date:** the built-in due and start dates take a day *plus an optional note*
   together, and a single typing box cannot express that — the refusal reads *"Due date needs a day
   in YYYY-MM-DD form (a note is optional)."* A **custom** date field *is* a plain day string and
   would be accepted — but a custom date only ever draws a marker (bullet 89, L1781: *"Markers only —
   a bar still requires the startDate + dueDate pair"*), and the attention strip's due-soon bucket and
   the Inbox both read the built-in due date only. So the near-miss puts a day on a calendar and
   chases nobody. The manual and FAQ state it that way; an earlier draft of this map presented it as
   a workaround and was wrong.
4. **No way to leave a comment on a job on the web.** The first half of this is fixed: the description is writable on the web since 2026-09-19 (C3, corrected). A free-standing comment box on a job is not there, and nothing on the web renders a comment thread. The exception is a **Move's** required comment — the transition dialog takes one when a `require-comment` rule carries it (`transition-dialog.test.tsx:251`) — and it is recorded on the move rather than shown back as a thread.

A smaller one in the same shape: nothing links to the six settings screens (C5).
