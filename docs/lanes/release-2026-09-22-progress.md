# Release 2026-09-22 — progress ledger (one line per batch claim and per task; appended by the driver, travels in each batch PR)

Read `docs/lanes/release-2026-09-22-plan.md` §0 first. Statuses: `claimed` (batch), `done`, `skipped`, `blocked`, `needs-owner`. Never rewrite a line; append.

| id | status | when / sha | note |
|---|---|---|---|
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
| B05 | claimed | 2026-09-21 18:41 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E4-17 | done | 5b94eeff4e11331143cdadb294a111da0ceea985 | select.test.tsx E4-17 x2 |
| T-E4-21 | done | e42e3c7f5bd0fb7ab98a3fad2b0710b022605ca2 | components.test.tsx E4-21 x4 |
| T-P18 | done | 96f6508ac18417d4a0a9ce2efab71320b3de1d6c | route-announcer.test.tsx x5 |
| T-P23 | done | ffadbb08ea1234c2c9eddf41dba71205701b2e08 | select.test.tsx P23 x2 (mutation-witnessed) |
| T-P9 | done | 303720e458759f5361298022f392db5ccebbf298 | components.test.tsx P9 x4 |
| T-P8 | done | cf7ee59ab84197edd42fe884ef168ae5126348de | components.test.tsx P8 x4 |
