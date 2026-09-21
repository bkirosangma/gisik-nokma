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
| B05 | claimed | 2026-09-21 18:41 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E4-17 | done | 5b94eeff4e11331143cdadb294a111da0ceea985 | select.test.tsx E4-17 x2 |
| T-E4-21 | done | e42e3c7f5bd0fb7ab98a3fad2b0710b022605ca2 | components.test.tsx E4-21 x4 |
| T-P18 | done | 96f6508ac18417d4a0a9ce2efab71320b3de1d6c | route-announcer.test.tsx x5 |
| T-P23 | done | ffadbb08ea1234c2c9eddf41dba71205701b2e08 | select.test.tsx P23 x2 (mutation-witnessed) |
| T-P9 | done | 303720e458759f5361298022f392db5ccebbf298 | components.test.tsx P9 x4 |
| T-P8 | done | cf7ee59ab84197edd42fe884ef168ae5126348de | components.test.tsx P8 x4 |
