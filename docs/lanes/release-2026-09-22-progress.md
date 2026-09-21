# Release 2026-09-22 — progress ledger (one line per batch claim and per task; appended by the driver, travels in each batch PR)

Read `docs/lanes/release-2026-09-22-plan.md` §0 first. Statuses: `claimed` (batch), `done`, `skipped`, `blocked`, `needs-owner`. Never rewrite a line; append.

| id | status | when / sha | note |
|---|---|---|---|
| B05 | claimed | 2026-09-21 18:41 | /Users/kiro/my_projects/gisik-nokma-ds5 |
| T-E4-17 | done | 5b94eeff4e11331143cdadb294a111da0ceea985 | select.test.tsx E4-17 x2 |
| T-E4-21 | done | e42e3c7f5bd0fb7ab98a3fad2b0710b022605ca2 | components.test.tsx E4-21 x4 |
| T-P18 | done | 96f6508ac18417d4a0a9ce2efab71320b3de1d6c | route-announcer.test.tsx x5 |
| T-P23 | done | ffadbb08ea1234c2c9eddf41dba71205701b2e08 | select.test.tsx P23 x2 (mutation-witnessed) |
| T-P9 | done | 303720e458759f5361298022f392db5ccebbf298 | components.test.tsx P9 x4 |
| T-P8 | done | cf7ee59ab84197edd42fe884ef168ae5126348de | components.test.tsx P8 x4 |
| B13 | claimed | 2026-09-21 21:52 | /Users/kiro/my_projects/gisik-nokma-ds3 |
| T-E5-2 | done | 049c8c60628a97ec697b3656f9878155223f48d1 | board.test.tsx 13.1177 x6; 2 mutations, distinct signatures |
| T-E5-6 | done | 0f9005c603ec2931987c4dfc131c003a97315645 | ticket-sheet.test.tsx 13.1178 x6; 2 mutations (one SURVIVED first, case was vacuous, fixed) |

**§13 id block for B13 (controller allocation, 2026-09-21 22:0x): `13.1177`–`13.1186`** — §13 ids are now per release batch like §17; the block table lands in `test-cases/13-hig-per-screen.md`. B13 mints §13 ids only from this block, and inside the block in order. **Spent: `13.1177` (T-E5-2). Next free: `13.1178`.** If `check-case-ids` ever reds on a collision with `main`, `main`'s ids never move — renumber OURS into the block. For any section with no block table, the next free id is the max over `origin/main` AND every `origin/rel/*` head, verified by union==sum.

