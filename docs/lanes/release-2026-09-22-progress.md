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
| B07 | claimed | 2026-09-21 20:50 | /Users/kiro/my_projects/gisik-nokma-exec4 |
| T-E6-24 | done | 24997d03e767466c7f1b0460674e6e72b445dd03 | replica-deleted-reads.test.ts E6-24 x4 (case 12.399) |
| T-E6-2 | done | f6231926363f3245f98cd5a154fa8b43dcfa2417 | live-ticket.test.ts E6-2 x23 (mutation-witnessed) + soft-deleted-writes.test.ts x13 through POST /v1/events (case 17.121) |
| T-E6-4 | done | 35c414f1910b69843641df43764a283e54e3243b | deleted-hierarchy.test.ts E6-4 x6 + soft-deleted-hierarchy.test.ts x4 through POST /v1/events (cases 17.122-17.123) |
| T-F2-fn | done | ccc22a4a93433fdd468621e4cb370f6fb81c5d1a | prose-only: false warrant withdrawn in soft-delete-background-paths.test.ts (c), Features.md, 16.90(c); citations re-pointed by content |
| T-F4-fn | done | 39167c28d48b5a16e21e8d8d35c323e5e7e926f7 | my-work.test.ts F4 x1 (mutation-witnessed: 1 failed / 24 passed) (case 17.124) |
| T-F5-fn | done | 066f2491d799929b0659175d8d8dd610d7755d03 | replica-deleted-reads.test.ts F5 x2 (mutation-witnessed, one kill each); 16.90 flipped to ✅ (case 17.125) |
| T-E6-11 | done | 76f6b6994862b28045dc72a3964210e4ac0f79e7 | list.test.ts E6-11 x1 through GET /v1/projects/:id/tickets?groupBy=epic (case 17.126); the restricted-epic LABEL stays the owner's recorded question |
| B12 | claimed | 2026-09-21 21:17 | /Users/kiro/my_projects/gisik-nokma-exec2 |
| T-E3-19 | done | 0970a58c98b4ed93d7417a8f6b7afbab39454f06 | parent-terminal-symmetric.test.ts (8) + precheck.test.ts gate 5 (5) |
| T-E6-10 | done | 2437eb174844fef73953a28a18a41a58c6ce012a | builder-reads.test.ts 7.266 (RED [1,1] → GREEN [2,0]) |
| T-E6-3 | done | 58d51ed67ffc2d7b2d2a6a0fdd5857cb03b9c444 | decision recorded (occupancy doctrine binds): ticket-types.test.tsx 10.120 RED→GREEN; ticket-type-rerank.test.ts 5.80 witness |
| T-E6-8 | done | 35bba9569e9933d0048b5a53e6ddd1a2beacb627 | close-with-open-children.test.ts (6) + sweep.test.ts 13.1167 + precheck.test.ts (3) |
| B16 | claimed | 2026-09-21 21:18 | /Users/kiro/my_projects/gisik-nokma-exec6 |
| T-E6-13 | done | 6f5d5780e747ef47c82f46e32d2dda8ca7260f2f | verify-projections.test.ts E6-13 x2 (case 3.960; both re-bind orders, RED drift + RED throw → GREEN) |
| T-E6-22 | done | 1ffb32df94bdd9c6687cea11cacfcff5ac1e8a59 | prose only: canSee docblock + Features.md canSee bullet record the divergence and the inert door |
| T-E6-23 | done | 58197f25ba7a1b9e7145ddebee43cda2c76ee81e | schedule.test.ts 13.1200 (planted defect, RED→GREEN) + 13.1201 control |
| T-E6-5 | done | 226645af1bf35e6180851131d27e4f7673404d3e | outbox.test.ts E6-5/12.960 (RED overtake → GREEN due-prefix) + 12.961 control; server half (contest on unknown ticket) needs-owner — see case 12.960 |
| T-E6-17 | done | 1a5967d042ab35baf8cded278f46ab226199340e | check-visibility-permission.test.ts 6.151 (planted defect, RED→GREEN) + 6.152 controls; server package, not domain (brief header discrepancy noted in commit) |
| T-E6-19 | done | 3fdb357810fa0a98567df6f146084fb8256ca56f | ist-day.test.ts 3.961 + ticket-types.test.ts 5.77 + rule-engine fields.test.ts 5.78 (RED→GREEN); filter bounds left shape-only, reason in commit |
| T-E6-20 | done | ba15105f3641100aaede255662a27ca27056b895 | workflow-schema.test.ts 4.55 + ticket-types.test.ts 5.79 (RED→GREEN); displayName exported once from display-name.ts |
| T-E6-20 | done | 89c3af84f21b9c46e283dcd43090422a0b56102c | follow-up on the merged tree: displayName reports an empty name once (main E4-29 listed three items); app-core 1730/1730, server 1733, web 657, domain 553, rule-engine 346 |
| B13 | claimed | 2026-09-21 21:52 | /Users/kiro/my_projects/gisik-nokma-ds3 |
| T-E5-2 | done | 049c8c60628a97ec697b3656f9878155223f48d1 | board.test.tsx 13.1177 x6; 2 mutations, distinct signatures |
| T-E5-6 | done | 0f9005c603ec2931987c4dfc131c003a97315645 | ticket-sheet.test.tsx 13.1178 x6; 2 mutations (one SURVIVED first, case was vacuous, fixed) |
| T-E5-43 | done | 13308826a93f325620e65fc873820f41fc42bd44 | project-calendar-timeline.test.tsx 13.1179 x3; 2 mutations, distinct signatures |
| T-E2-30 | done | dcfd11c44ebf9c63714f2f7b7f18e8639db8c54b | sheet-delete.test.tsx 13.1180 x4; 2 mutations, both single-case |
| T-E5-11 | done | d47193c315ed0344f80523deb873ee640275076c | members-page.test.tsx 13.1181 x3; 2 mutations (3-fail / 1-fail) |
| T-E2-31 | done | a8ad9ff7483a0e5ed3acfb269deb4cfc7c5dfa0d | ticket-sheet.test.tsx 13.1182 x1; mutation B RE-ADDED the removed guard and reddened identically — inertness measured |
| T-E2-35 | done | f0ba7753536f9d5d7eb9dd4ccdad1fb9bfaccf64 | ticket-sheet.test.tsx 13.1183 x3; 2 mutations (3-fail / 1-fail) |
| T-E2-51 | done | ba7f52236e97d42b0c7730262099121a279d2a8e | prose-only: case 13.761 re-pointed, both citation sets verified; no suite moves |
**§13 id block for B13 (controller allocation, 2026-09-21 22:0x): `13.1177`–`13.1186`** — §13 ids are now per release batch like §17; the block table lands in `test-cases/13-hig-per-screen.md`. B13 mints §13 ids only from this block, and inside the block in order. **Spent: `13.1177` (T-E5-2). Next free: `13.1178`.** If `check-case-ids` ever reds on a collision with `main`, `main`'s ids never move — renumber OURS into the block. For any section with no block table, the next free id is the max over `origin/main` AND every `origin/rel/*` head, verified by union==sum.
| B11 | claimed | 2026-09-21 21:46 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E2-45 | done | 856eddc9 | app-nav.test.tsx 17.141–17.143 (E2-45) |
| T-E5-25 | done | 3f359c75 | 13.1157 session-expired write (sheet/board/bulk) + adapter; 13.1158 guard (mutation-witnessed) |
| T-E5-31 | done | a3234e8c | 13.1159 app-nav signed-out arm (RED 2 / GREEN 33) |
| T-E5-32 | done | 093526c9 | 13.1160 sign-in?next= on all five read arms (RED 4 / GREEN 634) |
| T-E5-5 | done | 5c05e994 | 13.1161 Collaborators note (RED 1 / GREEN 635) |
| T-V1 | done | ea000e4c | 13.1162 empty-board copy+glyph gating & shell wiring (RED 2 core / 1 web; 1728 + 636 green) |
| T-V5 | done | ab79978e | 13.1163 contested arm via ticketLocation.locate (RED 2 / GREEN 638) |
| T-E2-38 | done | af14c3f4 | 13.1164 archived chip on the project page (RED 1 / GREEN 640) |
| T-E5-23 | done | 962eae8f | 13.1165 founder's empty home (RED 1 / GREEN 642) |
| T-E5-34 | done | db88a264 | 13.1166 archived route named+badged (RED 1 / GREEN 644) |
| B11 | integration pre-flight | bdd8fde6 | merge materialised in a disposable worktree: 4 additive conflicts, guards+suites green after union, 2 web cases need the documented post-merge patch |
| B10 | claimed | 2026-09-21 21:23 | /Users/kiro/my_projects/gisik-nokma-ds1 |
| T-E4-11 | done | c268647e6010169708a4a1744729f3244dbc0d28 | nav-phone-disclosure.test.ts (13.1137) + app-nav.test.tsx (13.1138); web 637/637 |
| B10-ids | reserved | 2026-09-21 21:50 | case-id block 13.1139-13.1073 for batch B10 (verified free over all 25 catalogue files) |
| T-E4-13 | done | bda4a02fa2910e8b126d288b1519cdbd91d44445 | new-ticket-dialog.test.tsx (13.1139); app-core 1722/1722 |
| T-E4-14 | done | d94542ed2c1c1b7646cf23aecc0baeeed96b29b9 | components.test.tsx (13.1140); ui 399/399 |
| T-E4-3 | done | 95b63f3cbe2932512d41094c83e67cc507e64bc4 | tap-target-density.test.ts (13.1141); ui 399/399, web 639/639; DENSE_IN_LIST clause (b) UNMET, recorded |
| T-E4-7 | done | feeb1eb0364e039ff1d8a732e8f777693d9b2372 | components.test.tsx (13.1142); ui 402/402; not painted |
| T-P1 | done | e105e218fd5a3885eb4a5c32caaa333ba0d73e48 | bare-control-coverage.test.ts (13.1143) 4/4; editor 188/188, ui 406/406; 4 of 6 fixed, 2 are <a> no-ops (recorded) |
| T-P2 | done | eb7bba1cae6f205908c9500104897bd59c743ab8 | components.test.tsx (13.1144); ui 410/410; Features.md rationale added; not painted |
| T-E4-31 | done | e4dd9c211f8d4820ec46dbbe4ce25008fe202675 | tokens.test.ts (13.1145); accent stepped both themes (#2d5488/#97bdf2); ui 410, web 639, app-core 1722 |
| T-I2 | done | 056260d11d5bfd97783bc9d589654b82ce9c53e6 | roster provenance stamp; typecheck 17/17; no product test (DONE WHEN says none needed) |
| T-P24 | done | 232403d9adbe0eba95abb6dd34395f8f262436c0 | tokens.test.ts (13.1146) sweep 3/3; ui 413, web 639; dangerText option refuted (1.06:1) |
| T-E4-15 | done | 96f943c8980461fd8caead688f61dfc80656f464 | components.test.tsx (13.1147); ui 416, web 639; P35's ask is a subset and is satisfied here |
| T-E4-2 | done | 0c515a8a37b8b129325e39412b7118c0afe33a6b | components.test.tsx (13.1148); ui 420, web 639; sheet-opening sweep half NOT done (recorded) |
| T-E4-25 | done | 3ef6613dd6ee8cbd135ce764d6198ef31e31bf5c | settings-shell-tokens.test.ts (13.1149) 3/3 + 4 mutation plants; web 642 |
| T-P35 | done | 3ef6613dd6ee8cbd135ce764d6198ef31e31bf5c | satisfied by T-E4-15 (13.1147): the same rule, same defect; P35's single-property ask (border: none) is a subset of that commit |
| B10-ids | allocated | 2026-09-21 22:0x | controller (Fable): section-13 case ids are per RELEASE BATCH; B10 owns 13.1137-13.1156. The earlier self-declared reservation 13.1054-13.1073 is SUPERSEDED. |
| B10-ids | renumbered | dbd2d08a528d93bcc5c7abe73d50f2b80b4d49c9 | all 14 section-13 ids this batch had minted, into the allocated block; count unchanged at 2625 |
| T-E4-10 | done | 3d5896e75cbffee1512a7496edb3e415c3b5b5b5 | authoring-routes.test.tsx (13.1150) 9/9; web 643; first green was a FALSE RED from a stale app-core dist |
| T-E4-26 | done | 07d10ccabfd8eb35bd9caa8a9876b3d2bef644ec | ticket-list-css-binding.test.tsx (13.1151) 14/14; ui 420, app-core 1725, web 643; spacer bound + declarationsFor fixed; DENSE_IN_LIST half deferred |
| T-E4-27 | done | 49b1106adfbc727f073ca29050f4ae7e5072cb04 | 13.1152 in authoring-routes + builder-route; ui 420, app-core 1725, web 647 |
| T-E4-35 | done | 14cd0351eb79ce655980510bf954c0992ac61c73 | components.test.tsx (13.1153) 3/3; ui 423, web 647 |
| T-E4-8 | done | 9a221814e44160834e77fc4e39f378c11333eace | editor-toolbar.test.tsx (13.1154) 13/13; editor 191, ui 423, web 647 |
| T-P27 | done | 04fec411582400e34ecb35972ed95f8cb4202f7c | viewport-reflow-320.test.ts (13.1155) 3/3; web 650; typecheck 17/17; phone-320 baselines MISSING (owner named) |
| T-E4-9 | done | febbb3e6c84015fdd44b4bf726a811b6ff2bc682 | builder-route.test.tsx (13.1156) 10/10; ui 423, app-core 1725, web 652; overflow-loop third deferred |
| T-E4-32 | done | 7eab13fb86445fdf38c25d1df3d158ae73b1edbd | tokens.test.ts, second arm of 13.1146 (no new id - the sweep is narrower than the finding); ui 426, web 652 |
| T-P10 | done | 31f501bae4eff4b5ec5ad3bada029e4e1703245c | prose-only per its DONE WHEN; message + counter docblock; typecheck 17/17; web 652 |
| ASK | blocked | 2026-09-21 23:0x | B10's section-13 block 13.1137-13.1156 is FULLY USED (20 ids minted, 13.1137-13.1156). Four tasks remain and each needs a case id: T-E4-24 and T-P17 (heading outline, one shared instrument -> 1 id), T-P36 (duplicate h1/h2 -> 1 id), T-E4-36 (help results count role=status -> 1 id). REQUEST: 3 more section-13 ids for batch B10. Until they arrive the four carry catalogue entries whose case marker names the TASK and says "id pending allocation" - no id has been minted outside the block. |
| T-E4-24 | done | 8371ef241670da406e51b2bada4902ffcd198829 | heading-outline.test.ts + board-narrowing.test.tsx; 7 headings h3->h2; app-core 1728, web 652; CASE ID PENDING ALLOCATION |
| T-P17 | done | 8371ef241670da406e51b2bada4902ffcd198829 | heading-outline.test.ts + board-narrowing.test.tsx; 7 headings h3->h2; app-core 1728, web 652; CASE ID PENDING ALLOCATION |
| T-P36 | done | 4db375f10a7434227dbad06719e0711718cfe8fe | authoring-routes.test.tsx (T-P36 marker); both routes h1 -> Settings; web 654; CASE ID PENDING ALLOCATION (13.1157 minted then withdrawn before commit) |
| T-E4-36 | done | 264d75bfe866e5d5505920b83e08d9a8d72c92fd | help-browser.test.tsx (T-E4-36 marker) 16/16; ui 426, app-core 1731, web 654; CASE ID PENDING ALLOCATION |
| B15 | claimed | 2026-09-21 23:24 | /Users/kiro/my_projects/gisik-nokma-exec6 |
| T-E4-16 | done | 251d634e | 18 passed (contrast override CSS-rule read); app-core suite 98 files/1732 tests |
| T-E4-28 | done | 7833a945 | 5 new (11.216-11.218): aria-label day cells, aria-describedby bars; app-core 98/1737, ui 8/396 |
| T-E4-20 | done | 1c7122bd | canvas.test.tsx 10.93 source-scan; height-floor deferred (Playwright, off-gate); app-core 98/1738 |
| T-P20 | done | 5588b7e9 | 11.219 grid/row/columnheader/gridcell roles; app-core 98/1740 |
| B17 | claimed | 2026-09-21 20:15 | /Users/kiro/my_projects/gisik-nokma-ds3 |
| T-E6-7 | done | ad7aac74 | convention recorded + pinned by BOTH runners (check:migrations self-test and 13.903); /tmp/ds3-e6-7-tooling-red.log -> /tmp/ds3-e6-7-tooling-green.log; finding's "1e11" corrected to the measured 1e8 |
| T-F8-fn | done | baa2f8b1 | prose-only: the exclusion is recorded in ci.yml check-env + the script docblock; comments-only proven by a stripped diff; finding's "eight" universe corrected (check-help is not one of the nine) |
| T-P15 | done | 18529703 | prose-only: PROVENANCE.md records the 2026-09-20 export + the +1 mapping (92.2% measured over the whole file, not anchors); desktop.dc.html UNTOUCHED; finding's 1,113-line and 71-file numbers corrected to what I measured |
| T-P5 | done | 78ce3e4f | prose-only: the dropped selector is RECORDED in the subtask bullet (Features.md, no line added so its citations still resolve) + the decision named for the owner; the sweep the review skipped was run (only in-repo hit is a QUEUED row) |
| T-E4-12 | done | 7fdcaea9 | tap targets now measured per ROUTE in the loop + a gate-level source case that reddens if the call leaves it (mutation-witnessed: /tmp/ds3-e412-gate-red.log -> /tmp/ds3-e412-gate-restored.log); measureContrast lift + sheet/builder states NOT done (measured reasons, commit body); Features.md had a byte-identical DUPLICATE bullet under §14 — fixed |
| T-F2-ux | done | f09b4703 | the help gate now checks both documents against the PRODUCT, ratcheted on a 59-entry measured baseline (226 occurrences / 171 distinct); EXCLUDES content.generated.ts from the haystack — its first version could not fail and its own mutation printed EXIT=0; both mutation directions run (red-a/red-b), 15.35 + Features.md in the same set |
| T-I1 | needs-owner | - | NOT IMPLEMENTED — the task is marked ⚠ THIS TASK NEEDS THE OWNER. What must be decided: no browser-based UI instrument has executed anywhere since 2026-09-06T09:05:54Z, and it is not a failing step — the CI runner never starts (every job steps=0, runner_name=""), so (a) the standing auto-merge authorization reads "an independent CI run green" and no run has been green for 15 days, and (b) this lane could not run either browser suite from its worktree, which is why three B17 tasks carry a stated "not run here" (the only stack on :3001 belongs to another checkout, and a count taken there is not a measurement of this tree). The owner decides whether to restore the runner/billing or treat the gate as nominal. |
| T-P11 | done | 923e6519 | the LISTBOX pattern is in the tap-target arms and the arms are EXPORTED+jsdom-tested (option row, listbox, tabindex row, plain <li> negative control); mutation-witnessed (/tmp/ds3-p11-red.log -> /tmp/ds3-p11-restored.log); the remedy's other half (a spec that OPENS a panel) lands with P34 — named, not silently dropped |
| T-P16 | done | eb1d9659 | ONE multi-line CSS scanner in test/helpers/ (6 files migrated; 3 had the broken single-line form); neo-card-radius's absence assertion can now fail — the discriminating mutation reformats .gn-sign-in across lines and the failure PRINTS the whole rule (2 failed | 3 passed); old scanner's blindness demonstrated in one command |
| T-P34 | done | cd77b2b2 | the four non-default project VIEWS now have keyed route entries with self-proving reach hooks (clicks the tab, reads aria-selected back); the List one also opens the Select panel (P11's other half, asserting a visible listbox when enabled, reporting when disabled); gate-level case with the default entry as control; mutation: dropping one reach reddens that case alone (1 failed | 6 passed) |
| T-E6-26 | needs-owner | - | NOT IMPLEMENTED — the task is marked ⚠ THIS TASK NEEDS THE OWNER (OWNER-DECISION). What must be decided: `proj_rollups` is recomputed inside every ticket, workflow and reparent transaction, replayed by the release-gate verifier, and read by NOTHING in the product (0 SQL readers outside projections/rollups.ts; `getRollup(` has one non-test occurrence — its own definition at rollups.ts:133; Features.md records it as interim "Nothing reads it yet…" for a reason that has since expired). The choice is READ IT (rollupFor could take its category counts from it once the 6.83 enumeration mismatch is resolved) or DROP the projection and its verifier row, saying which in Features.md:408. A projection kept "in case" is the rule this repo states for controls and components. |
| T-E6-6 | done | 8ba02999 | the silent-skip guard can now FAIL on its own universe: an empty report REFUSES (was ok/EXIT=0 — reproduced at HEAD), .runIf( recognised, 6-case self-test; refuses on EMPTY rather than on the per-shard shortfall (the briefed form would redden 3 healthy shards) and STATES the shortfall instead |
| B18 | claimed | 2026-09-21 23:24 | /Users/kiro/my_projects/gisik-nokma-ds1 |
| T-E3-10 | done | 296629a2 | prose-only: sync-routes.ts docblock counts re-derived (18/15, union exact) |
| T-E3-11 | done | ce641d60 | prose-only: Features.md fixture count dropped, pinned to the fixtures.test.ts gate |
| T-E3-12 | done | 15bcaba9 | prose-only: Features.md "eleven checks" dropped; reserved-id class added to the enumeration |
| T-E3-13 | done | 01c9de90 | prose-only: visible-where.ts cites the fixture row by content, not by :88 |
| T-E3-16 | done | c0606d63 | citation sweep: 11 live sites cite the roster-cut clause by its words (ui 57, app-core 25) |
| T-E3-17 | done | c97c7f31 | prose-only: outbox docblock drops the derived total (sync-client 90) |
| T-E3-18 | done | 88f5a1ff | prose-only: replica dangling-parent comment stops claiming parity (app-core 1730) |
| T-E3-20 | done | 0b13801a | prose-only: case 6.82 partially closed in place (term landed, open/active absent) |
| T-E3-21 | done | 70946c4b | case 6.84 split: refusal ✅ (hierarchy.ts:124/:250) + rollup property ✅ (rollup 6 green) |
| T-E3-22 | done | cf12d5cc | case 6.58 closed: hierarchy.cycle refuses the repro at both walks |
| T-E3-23 | done | a40f3b83 | case 6.124 closed: both URLs take httpUrl() (config 27 green) |
| T-E3-24 | done | 952ac8e2 | case 6.66 closed: parent placeholder is existence-vs-TITLE, withheld-title assertion written |
| T-E3-25 | done | 1070b662 | case 6.96 closed: SyncItem has four arms; cited by the discriminator test (sync-client 90) |
| T-E3-26 | done | 332dd81e | Features.md settings bullet: nav entry landed; reachability measured via router.push |
| T-E3-27 | done | 770d8b47 | checkErrandTemplate "not yet landed" corrected in both files (app-core 9 green) |
| T-E3-28 | done | b2a3d3fb | offline-born omission set names getTicket as the third omitting door |
| T-E3-29 | done | 5fdf77c2 | Features.md vocabulary bullet scoped to Plan 3; the eight later types named |
| T-E3-30 | done | dbf32834 | case 6.83 closed: the measurement exists, is named after the case (13 green) |
| T-E3-31 | done | 25b8d5b7 | case 6.57 struck: cross-project reparent refused at both doors (tickets-read 14 green) |
| T-E3-33 | done | 571ef830 | proj-projects position paragraph corrected; index.ts had the true account (order 3 green) |
| T-E3-34 | done | 4c0d25ae | assignment-fold docblock: the door refuses it (role-permission 48 green) |
| T-E3-9 | done | e7d45076 | envelope field count named not counted; probe says eleven (domain 548 green) |
| T-E6-12 | done | c2723621 | 6.51/6.77/6.123 superseded; 6.77 closed, two partial (perm 28 green) |
| T-E6-14 | done | 8ed0e6ce | delete toast names key ?? title; both arms pinned (app-core 1731, web 5) |
| T-E6-25 | done | d2e2787a | deploy comments: all nine config vars consumed; four stale claims corrected |
| T-F1-fn | done | 078a58de | attachment-leak gap marked closed; both stale numbers corrected (7 green) |
| T-F3-fn | done | d3dda5f7 | §17 names the prototype copy and its sha, with the ruling's +1 offset |
| T-F6-fn | done | 7d358fed | soft-delete enumeration: 14 constant uses, 18 SQL statements (10 green) |
| T-F7-fn | done | e4d6236a | §17: a lane with no row must STOP AND ASK (the count half was superseded) |
| T-I3 | done | 0bc9919c | tap-targets: the my-work exclusion names its real reason (stack window) |
| T-I4 | done | 95d09284 | tap-targets cites the ui.css sentence by its words, not by a wrong range |
| T-I5 | done | 3fe7d95e | executor-state: the older id block points forward; two dupes resolved |
| T-P25 | done | ee15d4eb | back-button citations name the reason, not the deleted file (web 19 green) |
| T-P26 | done | dbfd0dac | prototype-delta: 11 queue rows marked closed/undecided; 3 per-screen claims fixed |
| T-P29 | done | ca2bf401 | smoke.spec: all ten stubs cite a line; seven drifted citations corrected |
| T-P32 | done | 1d9db468 | three disabled controls attach their reason via aria-describedby (2 mutations killed) |
| T-P33 | done | d1512158 | inbox row time: the omission is CLOSED by E5-35; toggle half still holds |
