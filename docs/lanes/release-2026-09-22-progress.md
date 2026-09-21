# Release 2026-09-22 — progress ledger (one line per batch claim and per task; appended by the driver, travels in each batch PR)

Read `docs/lanes/release-2026-09-22-plan.md` §0 first. Statuses: `claimed` (batch), `done`, `skipped`, `blocked`, `needs-owner`. Never rewrite a line; append.

| id | status | when / sha | note |
|---|---|---|---|
| B01 | claimed | 2026-09-21 19:45 | /Users/kiro/my_projects/gisik-nokma-exec6 |
| T-E3-14 | done | a7796c41 | security-middleware.test.ts PROTECTED table (13.116 + it.each) |
| T-E3-15 | done | 9c6655ec | security-middleware.test.ts 13.198 (onRoute seam) |
| T-E3-32 | done | deab2aa0 | check-permission.test.ts 12.398 (docblock content assertion) |
| T-E6-15 | done | 871065c3 | security-middleware.test.ts 13.1077-13.1080 (stream origin check; minted 13.1100-13.1103, renumbered into B01's §13 block) |
| T-E6-16 | done | a4063bb5 | device-flow.test.ts 14.112-14.112b (authKind fence) |
| T-E6-18 | done | 3570edf1 | ingest.test.ts 3.900-3.901 (invalid-byte, narrow scope stated) |
| T-E6-21 | done | f4cb7c19 | check-role-permission.test.ts 6.150 (self-leave) |
| T-E6-9 | done | d67cea23 | members-page.test.tsx 3.902-3.903 (INVITE_CHANNELS select) |
| B06 | claimed | 2026-09-21 21:05 | /Users/kiro/my_projects/gisik-nokma-ds1 |
| T-E2-21 | done | de7c4600 | ticket-types.test.tsx "keeps the authored mapping when the migration request is rejected" |
| T-E2-40 | done | 6f004f9e | ticket-sheet.test.tsx "PLANTED DEFECT: the preview stops refusing once the field its own input asked for is filled" |
| T-E5-7 | done | 1924fc9a | ticket-sheet.test.tsx "PLANTED DEFECT: the require-comment preview stops refusing once the comment its own box asked for is typed" |
| T-V10 | done | 4cb4b110 | new-ticket-dialog.test.tsx "two presses in one commit call onCreate ONCE" + reopen-flow.test.tsx "two clicks in one commit record ONE ticket.created" |
| T-E5-16 | done | 77e176f0 | new-ticket-dialog.test.tsx "PLANTED DEFECT: the control paints the everyday type, not rank 1" |
| T-E5-20 | done | 41a47331 | ticket-sheet.test.tsx "PLANTED DEFECT: one Escape closes the Move dialog and leaves the sheet open" |
| T-E5-9 | done | 40fda004 | ticket-sheet.test.tsx "PLANTED DEFECT: ONE sentence, inside the footer, not at the head of the body" (+ B06 case ids renumbered off B08: 3.178-3.182 -> 3.185-3.189, 10.90 -> 10.112) |
| T-V8 | done | a8125d3b | ticket-sheet.test.tsx "PLANTED DEFECT: no false not-shown-rather-than-shown-short alert while the child read is in flight" |
| T-E2-22 | done | bc14d674 | publish.test.tsx "PLANTED DEFECT: a refused publish keeps the mapping dialog, and the refusal lands inside it" |
| T-E2-33 | done | d892a1ff | new-ticket-dialog.test.tsx "a ladder swap cannot leave the screen saying none chosen while a type travels" + reopen-flow.test.tsx "a swap cannot leave the payload carrying a state the picker no longer offers" + visibility-editor.test.tsx "the fieldset follows the standing claim" |
| T-E2-34 | done | a2e64940 | reopen-flow.test.tsx "PLANTED DEFECT: the offer replaces the New-ticket dialog rather than stacking on it" |
| T-E2-37 | done | e28e1434 | new-ticket-dialog.test.tsx "PLANTED DEFECT: reopening offers no title, and Create is disabled again" |
| B03 | claimed | 2026-09-21 18:42 | /Users/kiro/my_projects/gisik-nokma-ds1 |
| T-E4-4 | done | 61e0e575 | 9.257 both composers named (editor slot) · 9.258 named through the app + dt Description (web) |
| T-E4-5 | done | fa9448d2 | 13.995 h1 named from the visible workspace name via aria-labelledby (web suite 624 passed) |
| T-E4-5 | needs-owner | fa9448d2 | E4-5's own remedy (plain h1 + adjacent Rename button) would REVERSE the owner's 2026-09-19 shape ruling recorded at test-cases/13-neomorphism-and-workspace-screens.md:2125 and enforced by 13.969 arms 1+3. Not taken; aria-labelledby closes the measured defect with all three 13.969 arms green. Owner to confirm the shape stands. |
| T-P12 | done | 0e99bedf | 13.1057 every route declares a title (sweep + runtime); server half measured in next build output |
| T-P19 | done | 5ada8ba9 | 13.1058 the view rail adopts SegmentedControl and is named "Project view" (web suite 631 passed) |
| T-P21 | done | 0e0ce247 | 9.259 description composer named by its <dt> via labelledBy through the shared contract; contract mutation-witnessed |
| T-P22 | done | 63519f7a | 13.1059 both menus named; new role="menu" source sweep + two runtime arms |
| T-P31 | done | 1bcfbc94 | 13.1053 both nav landmarks named; product-wide <nav> sweep + two runtime arms; 13.685 moved with its reason written in |
| T-E4-33 | done | 6fbe6ecc | 13.1054 the shell names a nameless person from the email; one displayLabel module for both labels |
| T-P13 | done | 151cf55d | 13.1055 skip link as the first focusable element + id=gn-main on all 23 route mains; measured in the prerendered HTML |
| T-V6 | done | 20334cd2 | 13.1056 five Loading arms carry role="status" (count-pinned sweep + one rendered arm) |
| T-P12 | done | d60abe1e | 13.1057 CORRECTION: the client effect lost to React head hydration (measured); replaced by a server layout per route segment |
| B05 | claimed | 2026-09-21 18:41 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E4-17 | done | 5b94eeff4e11331143cdadb294a111da0ceea985 | select.test.tsx E4-17 x2 |
| T-E4-21 | done | e42e3c7f5bd0fb7ab98a3fad2b0710b022605ca2 | components.test.tsx E4-21 x4 |
| T-P18 | done | 96f6508ac18417d4a0a9ce2efab71320b3de1d6c | route-announcer.test.tsx x5 |
| T-P23 | done | ffadbb08ea1234c2c9eddf41dba71205701b2e08 | select.test.tsx P23 x2 (mutation-witnessed) |
| T-P9 | done | 303720e458759f5361298022f392db5ccebbf298 | components.test.tsx P9 x4 |
| T-P8 | done | cf7ee59ab84197edd42fe884ef168ae5126348de | components.test.tsx P8 x4 |
| B04 | claimed | 2026-09-21 18:41 | /Users/kiro/my_projects/gisik-nokma-ds3 |
| T-E5-1 | done | c4175172 | prose-only: manual.md:664,666-668 + faq.md:307; check:help green |
| T-E5-24 | done | a1b06370 | prose-only: manual.md rows a/b/d/e + faq.md; row c (delete) is T-E6-1 |
| T-E6-1 | done | b36951f5 | app-core test/help 3 files/33 tests green; check:help green |
| T-F1-ux | done | e33b7b8a | prose-only: manual nav/theme/card/comments/attachments/settings + faq; 11 sites |
| T-E2-55 | done | 0f8fd1a9 | app-core ticket-sheet 110 tests green; notice moved above the list |
| T-E5-38 | done | 7e1a791d | web legal 17 tests green; draft notice on both pages |
| T-F5-ux | done | 28875a98 | founding lands on /w/<id>; founding.test 10 tests green |
| T-F8-ux | done | c0ab3ff9 | prose-only: stale self-test counts removed from 15.13 |
| T-E2-25 | done | eefcef71 | comment-only: 3 stale/false records corrected; mount-or-delete left to owner |
| T-E2-27 | done | c65d27ea | app-core skew-and-status 13 tests green; unknown arm returns queue sentence |
| T-E2-36 | done | 0f1ed7b7 | app-core ticket-sheet 111 tests green; reload on every answer |
| T-E2-47 | done | e5f5bd7a | prose-only: sweep names four; editor 10 + app-core 111 tests green |
| T-E4-34 | done | 61f90bc4 | app-core ticket-types 52 tests green; guest row says Open |
| T-E2-54 | done | c9bd3942 | prose-only: shell-refusal inference narrowed; page-refusals 14 tests green |
| T-E4-29 | done | baf2e833 | app-core ticket-types 53 tests green; issues name the field |
| T-E5-17 | done | 02d97609 | mcp-tokens page mounts AppNav; 12 tests green |
| T-E5-22 | done | 7815bcd6 | subtask form names the type; ticket-sheet 112 tests green |
| T-E5-29 | done | e7f5f91f | dialog copy corrected; publish 20 tests green |
| T-F6-ux | done | 8706da3c | prose-only: guest chip claim scoped; workspaces-cards 16 tests green |
| T-E5-36 | done | 9de2d115 | projectCountLine(0) says "No projects yet"; 25 tests green |
| T-E5-12 | done | 04ac1714 | account row counts live + names archived; 18 tests green |
| T-E5-33 | done | cf064cfe | sign-in requires the email in a real form; 25 tests green |
| T-E5-14 | done | ebb82030 | on-screen reorder note + tie-break; 54 tests green |
| T-E5-35 | done | f75680b4 | inbox rows show WHEN + ticket; 67 tests green |
| T-F7-ux | done | a7d5fd85 | epic band says rows; ticket-list 71 tests green |
| T-E5-39 | blocked | - | remedy needs publishedAt/publishedBy ON THE READ: not reachable client-side (gateway has no workflow-events read; getWorkflow returns PublishedWorkflowDef = WorkflowDefinedPayload, which carries no instant/actor). Envelope has them and proj_workflows.published_workspace_seq makes the join possible, but serving them means a new read shape across apps/server/src/read/workflow-defs.ts + the route + the client mapper + the screen, on a type the whole workflow-builder shares. Plan allotted 0.3 h at haiku; this is not that. NOT done as a copy fix either: a sentence saying "no date recorded" would put a claim about the WIRE into the UI. |
| T-E4-6 | done | abc431e2 | picker labels name||email||id; app-core views 550 tests green |
| B02 | claimed | 2026-09-21 19:58 IST | /Users/kiro/my_projects/gisik-nokma-exec2 |
| T-E5-13 | done | c44d8275 | 11.215 apps/web/test/account-page.test.tsx |
| T-E5-41 | done | bedeb62c | 10.90 screens.test.tsx |
| T-E2-23 | done | 1e2c8d95 | passkeys-section.test.tsx + account-page.test.tsx |
| T-E2-24 | done | 5159b037 | notifications-section/sessions-section/account-page tests |
| T-E4-18 | done | e2043c47 | ticket-sheet.test.tsx |
| T-E5-37 | done | c84572a4 | app-nav.test.tsx |
| T-E5-4 | done | bc039a53 | ticket-sheet.test.tsx + filters-sheet.test.tsx |
| T-E5-19 | done | fd260632 | account-page.test.tsx |
| T-V2 | done | 7e99e073 | members-page.test.tsx |
| B09 | claimed | 2026-09-21 19:57 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E2-20 | done | 0bbb5d66 | 13.1050/13.1051 (ticket-types.test.tsx) — rejected read renders the load-error sentence, not Loading for ever |
| T-E2-39 | done | 50f48409 | 10.90/10.91 (screens.test.tsx) — failed roster read is a load failure, guest refusal still degrades; two mutation controls |
| T-E2-44 | done | 02f6d7d2 | 14.113 (mcp-tokens-page.test.tsx) — a failed read says so, never "No assistants are connected" |

**NOTICE — CASE-ID COLLISIONS ACROSS LIVE RELEASE LANES, AND B09'S RENUMBER (2026-09-21 20:42).** The plan's §0 rule 5 ("next free id in that file's section") was followed by six live lanes at once, and the tip is not a safe place to mint from while they run. Measured across ALL remote branches, not `origin/main`:
- **`10.90` was minted by BOTH B06 and B09** as a real case bullet in `test-cases/10-workflow-builder.md`; §10's occupied ordinals ran to `10.92`.
- **`13.1050`–`13.1051` (B09) collided with B03's `13.1050`–`13.1056`** in `test-cases/13-hig-per-screen.md`; §13's occupied ordinals ran to **`13.1103`** (B01), so `13.1100`–`13.1103` were taken as well.
- **B09 renumbered its three mints** — `13.1050`/`13.1051` → `13.1110`/`13.1111`, `10.90`/`10.91` → `10.110`/`10.111`, `14.113` → `14.150` — and took recorded BLOCKS (`13.1107`–`13.1116`, `10.110`–`10.119`, `14.150`–`14.159`) instead of tips. None of the moved ids had merged, which is the repo's condition for renumbering. **The three earlier B09 progress lines above still name the superseded ids; the case TEXT is authoritative and this line is the supersession record.** The blocks are recorded in the id-block authority for each section (`test-cases/13-deployment-dogfooding.md` header, and §10's and §14's own headers) so the next lane reads them before minting.
- ⚠ **This is a coordination defect the controller may want to fix for the remaining batches**, not merely a B09 matter: any two batches minting the same section will collide the same way, and the collision only becomes visible when both PRs merge — `check-case-ids` would then report `union < sum`.
| T-E4-23 | done | 238e6fde | 13.1112/13.1113 (ticket-sheet.test.tsx) — a server-answered 404 says "not here", not Loading for ever |
| T-E5-15 | done | fa294812 | 13.1114 (ticket-types.test.tsx) — the OTHER half of each Promise.all tuple; RED observed against the reverted fix |
| T-E5-40 | done | 7495e6fd | 13.1115 (backlog-tab.test.tsx) — the toggle-hidden backlog says so; scope note + manual name the Backlog |
| T-E5-42 | done | f317d1c6 | 13.1116/13.1107 (ticket-list.test.tsx) — prefsError split from list.error; the column-chooser sentence |
| T-V9 | done | 32fa059a | 17.061/17.062 (invite-page.test.tsx) — an unchecked link is not a dead link; retry added |
| T-E5-10 | done | e834cbd8 | 13.1108/13.1109 (inbox-bulk.test.tsx) — row + Undo failures speak; row splits by KIND, undo slot beside the toast |
| T-F4-ux | done | b638f9b6 | 17.063 (visibility-editor.test.tsx) — the read-only sentence names owner+admin; the arm stays dead, recorded with an owner |
| T-V3 | done | caab221a | 17.064/17.065 (visibility-editor.test.tsx) — a rejected write says so, Apply returns; transportError slot |
| T-E5-18 | done | 49b64116 | 17.066-17.069 (invites.test.ts, invite-page.test.tsx) — expiry carried+rendered, dead arm links out; DECLINE recorded as owed |
| T-E5-30 | done | 3bd8f18b | 17.070 (page-refusals.test.tsx) — the panel names the action, wire string on its own line; 29 assertions swept |
| T-E2-26 | done | da551cd4 | 17.071 (inbox-bulk.test.tsx) — the row speaks in the row-s vocabulary; the bulk reuse suggested by the finding is refused with its reason |
| T-E2-32 | done | 05d02da9 | 17.072 (ticket-sheet.test.tsx) — a committed move remounts the dialog; preserve-on-Cancel kept |
| B08 | claimed | 2026-09-21 19:57 | /Users/kiro/my_projects/gisik-nokma-ds3 |
| T-E2-29 | done | 47a411a4 | 3.178 / E2-29 — a rejected ingest during a Move is spoken by the dialog, never as the server's verdict |
| T-E2-46 | done | 33b653d9 | 9.260 / E2-46 — typed link IS offered the escape suggestion; recorded asymmetry was the probe (no RED: no behaviour changed) |
| T-E4-19 | done | 7d83f993 | 3.179-3.181 / E4-19 — History headline narrates; slug kept in .gn-history__slug; mutation kills 3 |
| T-E5-27 | done | 4516e2bf | 3.182 / E5-27 — Move in-flight latch; RED PASS (0) FAIL (1), GREEN PASS (1) FAIL (0), suite 1725 |
| T-E5-28 | done | a59bad07 | 10.130-10.132 / E5-28 — Publish transport+unknown arms, refusal keeps the mapping; RED PASS (0) FAIL (3), suite 1728 |
| T-E5-8 | done | f5e0878a | 3.183-3.184 / E5-8 — census over the domain lists; found attachment.added + claim.contested_resolved; RED PASS (3) FAIL (3), suite 1734 |
| T-F3-ux | done | aaee94cb | F3 — renderCommentBody; RED PASS (6) FAIL (1), GREEN PASS (21), suite 1749, ui 378. BLOCKED: §16 case id OWED — exec 2 block fully spent, reallocation needed |
| T-V4 | done | 976f87be | 17.022 / V4 — three-way comments split (failed outranks pending); RED PASS (9) FAIL (1), suite 1752. Also minted 17.021 for T-F3-ux and discharged the §16 note |
| T-V7 | done | 6dd30946 | 17.023 / V7 — explicit success signal (submit: Promise<boolean>); RED PASS (1) FAIL (1), editor 192, app-core 1752, web 622 |
| T-E4-1 | done | c781f9dc | 17.024 / E4-1 — epic crumb omitted when it is the parent; RED PASS (0) FAIL (1), suite 1753 |
| T-E4-30 | done | e81616af | 17.025 / E4-30 — link crumb ink var(--gn-text-accent); RED 2 failed, suite 1757, ui 378 |
| T-E5-3 | done | a7f169f3 | 17.026 / E5-3 — one-hop contract (server) + restricted arm (client); server 1728, app-core 1758 |
| T-P3 | done | 4f7209aa | 17.027 / P3 — parent crumb carries the parent key (wire + render); app-core 1761, server 1729, web 622 |
| T-P4 | done | e14109b9 | 17.028 / P4 — the sentence corrected (SAME->same SHAPE); RED kills 1, app-core 1763, ui 378 |
